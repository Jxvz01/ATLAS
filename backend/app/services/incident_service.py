"""
Core Incident Application Service.
Orchestrates database operations, validation, lifecycle state transitions, report linking,
duplicate detection, and append-only event auditing.
"""
from typing import List, Optional, Tuple, Dict, Any
from app.domain.models import IncidentRecord, IncidentReport, IncidentEvent, IncidentActor, DuplicateCandidate, utc_now_iso
from app.domain.enums import IncidentType, IncidentCategory, IncidentStatus, VerificationStatus, PriorityLevel, ReportSource, ActorRole, EventType
from app.domain.state_machine import IncidentStateMachine, IncidentLifecycleError
from app.services.duplicate_service import DuplicateDetector
from app.db.sqlite_store import db_store, SQLiteOperationalStore

class IncidentService:
    def __init__(self, store: SQLiteOperationalStore = db_store):
        self.store = store

    def create_incident_from_report(
        self,
        report: IncidentReport,
        actor: IncidentActor,
        initial_status: IncidentStatus = IncidentStatus.RECEIVED,
        severity: int = 3,
        urgency: int = 3
    ) -> Tuple[IncidentRecord, IncidentReport, List[DuplicateCandidate]]:
        """
        Ingests an incoming report, scans for potential duplicate incidents,
        persists the raw report record, creates an incident record, and logs audit events.
        """
        # Save raw report first
        persisted_report = self.store.insert_report(report)

        # Generate unique incident ID
        existing_all, total_count = self.store.list_incidents(limit=1000)
        existing_ids = {i.id for i in existing_all}
        new_inc_num = total_count + 101
        inc_id = f"INC-{new_inc_num}"
        while inc_id in existing_ids or self.store.get_incident(inc_id) is not None:
            new_inc_num += 1
            inc_id = f"INC-{new_inc_num}"

        # Assign category from type
        category = self._derive_category(report.emergency_type)

        # Default capabilities
        required_caps = self._derive_capabilities(report.emergency_type, report.requires_rescue, report.requires_medical)

        # Initial priority calculation
        priority_score = self._compute_priority_score(severity, urgency, report.people_affected)
        priority_level = self._compute_priority_level(priority_score)

        incident = IncidentRecord(
            id=inc_id,
            type=report.emergency_type,
            category=category,
            severity=severity,
            urgency=urgency,
            confidence=0.90 if report.source != ReportSource.SIMULATION else 0.99,
            priority_score=priority_score,
            priority_level=priority_level,
            status=initial_status,
            verification_status=report.verification_status,
            latitude=report.latitude,
            longitude=report.longitude,
            location_description=report.location_description or "",
            source=report.source,
            source_reference=report.reporter_reference,
            people_affected=report.people_affected,
            casualties=report.casualties,
            requiring_rescue=report.people_affected if report.requires_rescue else 0,
            requiring_medical=report.casualties if report.requires_medical else 0,
            description=report.description,
            required_capabilities=required_caps,
            reported_at=report.created_at,
            created_at=utc_now_iso(),
            updated_at=utc_now_iso()
        )

        # Scan duplicate candidates against existing incidents
        duplicate_candidates = DuplicateDetector.check_for_duplicates(incident, existing_all)

        # Persist incident
        saved_incident = self.store.insert_incident(incident)

        # Link report to incident
        persisted_report.incident_id = saved_incident.id
        # Update report in db
        with self.store.get_connection() as conn:
            conn.execute("UPDATE incident_reports SET incident_id = ? WHERE id = ?;", (saved_incident.id, persisted_report.id))
            conn.commit()

        # Audit Event 1: Incident Created
        event_created = IncidentEvent(
            id=f"EVT-{saved_incident.id}-INIT",
            event_type=EventType.INCIDENT_CREATED,
            entity_id=saved_incident.id,
            actor=actor,
            new_state=saved_incident.status.value,
            reason=f"Incident established from {report.source.value} report {persisted_report.id}",
            context={
                "report_id": persisted_report.id,
                "initial_status": initial_status.value,
                "source": report.source.value,
                "duplicates_found": len(duplicate_candidates)
            }
        )
        self.store.record_event(event_created)

        # If duplicates found, create audit flag event
        if duplicate_candidates:
            event_dup = IncidentEvent(
                id=f"EVT-{saved_incident.id}-DUP",
                event_type=EventType.DUPLICATE_FLAGGED,
                entity_id=saved_incident.id,
                actor=IncidentActor(id="system", name="ATLAS Deduplication Engine", role=ActorRole.SYSTEM),
                reason=f"Detected {len(duplicate_candidates)} potential duplicate candidate(s)",
                context={"candidates": [c.model_dump() for c in duplicate_candidates]}
            )
            self.store.record_event(event_dup)

        return saved_incident, persisted_report, duplicate_candidates

    def transition_incident(
        self,
        incident_id: str,
        target_status: IncidentStatus,
        actor: IncidentActor,
        reason: Optional[str] = None,
        context: Optional[dict] = None
    ) -> IncidentRecord:
        """Transitions an incident status following formal lifecycle validation."""
        incident = self.store.get_incident(incident_id)
        if not incident:
            raise ValueError(f"Incident '{incident_id}' not found.")

        updated_inc, event = IncidentStateMachine.apply_transition(
            incident=incident,
            target_status=target_status,
            actor=actor,
            reason=reason,
            context=context
        )

        self.store.update_incident(updated_inc)
        self.store.record_event(event)
        return updated_inc

    def verify_incident(
        self,
        incident_id: str,
        actor: IncidentActor,
        verification_notes: Optional[str] = None
    ) -> IncidentRecord:
        """Verifies an incident under review, advancing lifecycle to VERIFIED and optionally ACTIVE."""
        incident = self.store.get_incident(incident_id)
        if not incident:
            raise ValueError(f"Incident '{incident_id}' not found.")

        # Advance to VERIFIED
        updated_inc = self.transition_incident(
            incident_id=incident_id,
            target_status=IncidentStatus.VERIFIED,
            actor=actor,
            reason=verification_notes or "Field/command verification confirmed"
        )
        return updated_inc

    def resolve_incident(
        self,
        incident_id: str,
        actor: IncidentActor,
        resolution_summary: str
    ) -> IncidentRecord:
        """Resolves an active incident, recording closure justification."""
        return self.transition_incident(
            incident_id=incident_id,
            target_status=IncidentStatus.RESOLVED,
            actor=actor,
            reason=resolution_summary
        )

    def reopen_incident(
        self,
        incident_id: str,
        actor: IncidentActor,
        reopen_reason: str
    ) -> IncidentRecord:
        """Explicitly reopens a resolved or closed incident."""
        return self.transition_incident(
            incident_id=incident_id,
            target_status=IncidentStatus.ACTIVE,
            actor=actor,
            reason=reopen_reason
        )

    def link_report_to_incident(
        self,
        report_id: str,
        target_incident_id: str,
        actor: IncidentActor,
        reason: Optional[str] = None
    ) -> IncidentReport:
        """Associates a standalone report with an existing master incident without overwriting history."""
        report = self.store.get_report(report_id)
        if not report:
            raise ValueError(f"Report '{report_id}' not found.")

        incident = self.store.get_incident(target_incident_id)
        if not incident:
            raise ValueError(f"Incident '{target_incident_id}' not found.")

        report.incident_id = target_incident_id
        with self.store.get_connection() as conn:
            conn.execute("UPDATE incident_reports SET incident_id = ? WHERE id = ?;", (target_incident_id, report_id))
            conn.commit()

        # Audit event
        event = IncidentEvent(
            id=f"EVT-{target_incident_id}-LNK-{report_id}",
            event_type=EventType.REPORT_ASSOCIATED,
            entity_id=target_incident_id,
            actor=actor,
            reason=reason or f"Associated report {report_id} with incident {target_incident_id}",
            context={"report_id": report_id, "reporter": report.reporter_reference}
        )
        self.store.record_event(event)
        return report

    def _derive_category(self, inc_type: IncidentType) -> IncidentCategory:
        mapping = {
            IncidentType.FLOODING: IncidentCategory.NATURAL_DISASTER,
            IncidentType.MEDICAL_EMERGENCY: IncidentCategory.CASUALTY_AND_MEDICAL,
            IncidentType.FIRE: IncidentCategory.HAZARD_CONTAINMENT,
            IncidentType.TRAPPED_PEOPLE: IncidentCategory.PUBLIC_SAFETY,
            IncidentType.ROAD_BLOCKAGE: IncidentCategory.INFRASTRUCTURE,
            IncidentType.STRUCTURAL_COLLAPSE: IncidentCategory.INFRASTRUCTURE,
            IncidentType.HAZARDOUS_CONDITION: IncidentCategory.HAZARD_CONTAINMENT,
            IncidentType.OTHER: IncidentCategory.PUBLIC_SAFETY
        }
        return mapping.get(inc_type, IncidentCategory.PUBLIC_SAFETY)

    def _derive_capabilities(self, inc_type: IncidentType, requires_rescue: bool, requires_medical: bool) -> List[str]:
        caps = []
        if inc_type == IncidentType.FLOODING:
            caps.extend(["water_rescue", "evacuation"])
        elif inc_type == IncidentType.MEDICAL_EMERGENCY:
            caps.extend(["medical_trauma", "critical_transport"])
        elif inc_type == IncidentType.FIRE:
            caps.extend(["fire_suppression", "structural_extrication"])
        elif inc_type == IncidentType.TRAPPED_PEOPLE:
            caps.extend(["structural_extrication", "rescue_operations"])
        elif inc_type == IncidentType.ROAD_BLOCKAGE:
            caps.append("debris_clearance")
        elif inc_type == IncidentType.STRUCTURAL_COLLAPSE:
            caps.extend(["heavy_rescue", "structural_extrication"])

        if requires_rescue and "water_rescue" not in caps and "rescue_operations" not in caps:
            caps.append("rescue_operations")
        if requires_medical and "medical_trauma" not in caps:
            caps.append("medical_trauma")
        return caps

    def _compute_priority_score(self, severity: int, urgency: int, affected_population: int) -> float:
        # Multi-factor normalized formulation: 0.40 * Severity + 0.35 * Urgency + 0.25 * Exposure
        exposure_norm = min(5.0, 1.0 + (affected_population / 10.0))
        score = (0.40 * severity) + (0.35 * urgency) + (0.25 * exposure_norm)
        return round(min(5.0, max(1.0, score)), 2)

    def _compute_priority_level(self, score: float) -> PriorityLevel:
        if score >= 4.0:
            return PriorityLevel.CRITICAL
        elif score >= 3.2:
            return PriorityLevel.HIGH
        elif score >= 2.2:
            return PriorityLevel.MEDIUM
        return PriorityLevel.LOW

# Singleton service instance
incident_service = IncidentService()
