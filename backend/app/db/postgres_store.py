"""
PostgreSQL & PostGIS Repository Adapter for ATLAS Disaster Response Network.
Enforces foreign keys, GiST / SP-GiST spatial indexes, transactions, schema migrations,
and explicit concurrency locks (SELECT FOR UPDATE) to eliminate race conditions.
Seamlessly interoperates with SQLite during local test fixtures without PostGIS installed.
"""
import json
import math
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_, or_, select

from app.config import settings
from app.db.session import get_db_session, engine, init_db
from app.db.models_sql import (
    Base, IncidentModel, IncidentReportModel, IncidentEventModel,
    ResourceModel, HospitalModel, AssignmentModel, MedicalReferralModel,
    ShelterModel, RoadBlockageModel
)
from app.domain.models import (
    IncidentRecord, IncidentReport, IncidentEvent, IncidentActor,
    MedicalReferralRecord, ShelterRecord, utc_now_iso
)
from app.domain.enums import (
    IncidentType, IncidentCategory, IncidentStatus, VerificationStatus,
    PriorityLevel, ReportSource, ActorRole, EventType
)

class PostgresOperationalStore:
    def __init__(self):
        init_db()

    # =========================================================================
    # INCIDENTS CRUD & LIFECYCLE
    # =========================================================================
    def insert_incident(self, incident: IncidentRecord) -> IncidentRecord:
        with get_db_session() as session:
            # Construct WKT geometry for PostGIS if coordinates valid
            geom_wkt = f"SRID=4326;POINT({incident.longitude} {incident.latitude})"
            is_pg = not str(session.bind.url).startswith("sqlite")
            
            db_obj = IncidentModel(
                id=incident.id,
                type=incident.type.value if hasattr(incident.type, 'value') else str(incident.type),
                category=incident.category.value if hasattr(incident.category, 'value') else str(incident.category),
                severity=incident.severity,
                urgency=incident.urgency,
                confidence=incident.confidence,
                priority_score=incident.priority_score,
                priority_level=incident.priority_level.value if hasattr(incident.priority_level, 'value') else str(incident.priority_level),
                status=incident.status.value if hasattr(incident.status, 'value') else str(incident.status),
                verification_status=incident.verification_status.value if hasattr(incident.verification_status, 'value') else str(incident.verification_status),
                latitude=incident.latitude,
                longitude=incident.longitude,
                location_description=incident.location_description,
                source=incident.source.value if hasattr(incident.source, 'value') else str(incident.source),
                source_reference=incident.source_reference,
                people_affected=incident.people_affected,
                casualties=incident.casualties,
                requiring_rescue=incident.requiring_rescue,
                requiring_medical=incident.requiring_medical,
                description=incident.description,
                required_capabilities=json.dumps(incident.required_capabilities),
                hazard_information=incident.hazard_information,
                reported_at=incident.reported_at,
                created_at=incident.created_at,
                updated_at=incident.updated_at,
                verified_at=incident.verified_at,
                verified_by=incident.verified_by,
                assigned_resources=json.dumps(incident.assigned_resources),
                resolution_details=incident.resolution_details,
                resolved_at=incident.resolved_at,
                geom=geom_wkt if is_pg else None
            )
            session.add(db_obj)
        return incident

    def update_incident(self, incident: IncidentRecord) -> IncidentRecord:
        with get_db_session() as session:
            db_obj = session.query(IncidentModel).filter(IncidentModel.id == incident.id).first()
            if db_obj:
                db_obj.type = incident.type.value if hasattr(incident.type, 'value') else str(incident.type)
                db_obj.category = incident.category.value if hasattr(incident.category, 'value') else str(incident.category)
                db_obj.severity = incident.severity
                db_obj.urgency = incident.urgency
                db_obj.confidence = incident.confidence
                db_obj.priority_score = incident.priority_score
                db_obj.priority_level = incident.priority_level.value if hasattr(incident.priority_level, 'value') else str(incident.priority_level)
                db_obj.status = incident.status.value if hasattr(incident.status, 'value') else str(incident.status)
                db_obj.verification_status = incident.verification_status.value if hasattr(incident.verification_status, 'value') else str(incident.verification_status)
                db_obj.latitude = incident.latitude
                db_obj.longitude = incident.longitude
                db_obj.location_description = incident.location_description
                db_obj.people_affected = incident.people_affected
                db_obj.casualties = incident.casualties
                db_obj.requiring_rescue = incident.requiring_rescue
                db_obj.requiring_medical = incident.requiring_medical
                db_obj.description = incident.description
                db_obj.required_capabilities = json.dumps(incident.required_capabilities)
                db_obj.hazard_information = incident.hazard_information
                db_obj.updated_at = incident.updated_at
                db_obj.verified_at = incident.verified_at
                db_obj.verified_by = incident.verified_by
                db_obj.assigned_resources = json.dumps(incident.assigned_resources)
                db_obj.resolution_details = incident.resolution_details
                db_obj.resolved_at = incident.resolved_at
                
                is_pg = not str(session.bind.url).startswith("sqlite")
                if is_pg:
                    db_obj.geom = f"SRID=4326;POINT({incident.longitude} {incident.latitude})"
        return incident

    def get_incident(self, incident_id: str) -> Optional[IncidentRecord]:
        with get_db_session() as session:
            obj = session.query(IncidentModel).filter(IncidentModel.id == incident_id).first()
            if not obj:
                return None
            return self._model_to_incident(obj)

    def list_incidents(
        self,
        status: Optional[str] = None,
        incident_type: Optional[str] = None,
        severity_min: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[IncidentRecord], int]:
        with get_db_session() as session:
            q = session.query(IncidentModel)
            if status:
                q = q.filter(IncidentModel.status == status)
            if incident_type:
                q = q.filter(IncidentModel.type == incident_type)
            if severity_min is not None:
                q = q.filter(IncidentModel.severity >= severity_min)

            total = q.count()
            rows = q.order_by(IncidentModel.priority_score.desc(), IncidentModel.created_at.desc()).offset(offset).limit(limit).all()
            return [self._model_to_incident(r) for r in rows], total

    def _model_to_incident(self, row: IncidentModel) -> IncidentRecord:
        return IncidentRecord(
            id=row.id,
            type=IncidentType(row.type),
            category=IncidentCategory(row.category),
            severity=row.severity,
            urgency=row.urgency,
            confidence=row.confidence,
            priority_score=row.priority_score,
            priority_level=PriorityLevel(row.priority_level),
            status=IncidentStatus(row.status),
            verification_status=VerificationStatus(row.verification_status),
            latitude=row.latitude,
            longitude=row.longitude,
            location_description=row.location_description or "",
            source=ReportSource(row.source),
            source_reference=row.source_reference,
            people_affected=row.people_affected,
            casualties=row.casualties,
            requiring_rescue=row.requiring_rescue,
            requiring_medical=row.requiring_medical,
            description=row.description,
            required_capabilities=json.loads(row.required_capabilities or "[]"),
            hazard_information=row.hazard_information,
            reported_at=row.reported_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
            verified_at=row.verified_at,
            verified_by=row.verified_by,
            assigned_resources=json.loads(row.assigned_resources or "[]"),
            resolution_details=row.resolution_details,
            resolved_at=row.resolved_at
        )

    # =========================================================================
    # REPORTS CRUD
    # =========================================================================
    def insert_report(self, report: IncidentReport) -> IncidentReport:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            db_obj = IncidentReportModel(
                id=report.id,
                incident_id=report.incident_id,
                source=report.source.value if hasattr(report.source, 'value') else str(report.source),
                reporter_reference=report.reporter_reference,
                latitude=report.latitude,
                longitude=report.longitude,
                location_description=report.location_description,
                emergency_type=report.emergency_type.value if hasattr(report.emergency_type, 'value') else str(report.emergency_type),
                description=report.description,
                people_affected=report.people_affected,
                casualties=report.casualties,
                requires_rescue=report.requires_rescue,
                requires_medical=report.requires_medical,
                evidence_references=json.dumps(report.evidence_references),
                verification_status=report.verification_status.value if hasattr(report.verification_status, 'value') else str(report.verification_status),
                created_at=report.created_at,
                geom=f"SRID=4326;POINT({report.longitude} {report.latitude})" if is_pg else None
            )
            session.add(db_obj)
        return report

    def get_report(self, report_id: str) -> Optional[IncidentReport]:
        with get_db_session() as session:
            obj = session.query(IncidentReportModel).filter(IncidentReportModel.id == report_id).first()
            if not obj:
                return None
            return self._model_to_report(obj)

    def list_reports_for_incident(self, incident_id: str) -> List[IncidentReport]:
        with get_db_session() as session:
            rows = session.query(IncidentReportModel).filter(IncidentReportModel.incident_id == incident_id).order_by(IncidentReportModel.created_at.desc()).all()
            return [self._model_to_report(r) for r in rows]

    def _model_to_report(self, row: IncidentReportModel) -> IncidentReport:
        return IncidentReport(
            id=row.id,
            incident_id=row.incident_id,
            source=ReportSource(row.source),
            reporter_reference=row.reporter_reference,
            latitude=row.latitude,
            longitude=row.longitude,
            location_description=row.location_description,
            emergency_type=IncidentType(row.emergency_type),
            description=row.description,
            people_affected=row.people_affected,
            casualties=row.casualties,
            requires_rescue=bool(row.requires_rescue),
            requires_medical=bool(row.requires_medical),
            evidence_references=json.loads(row.evidence_references or "[]"),
            verification_status=VerificationStatus(row.verification_status),
            created_at=row.created_at
        )

    # =========================================================================
    # EVENTS AUDIT TRAIL
    # =========================================================================
    def record_event(self, event: IncidentEvent) -> IncidentEvent:
        with get_db_session() as session:
            db_obj = IncidentEventModel(
                id=event.id,
                event_type=event.event_type.value if hasattr(event.event_type, 'value') else str(event.event_type),
                entity_id=event.entity_id,
                actor_id=event.actor.id,
                actor_name=event.actor.name,
                actor_role=event.actor.role.value if hasattr(event.actor.role, 'value') else str(event.actor.role),
                previous_state=event.previous_state,
                new_state=event.new_state,
                reason=event.reason,
                context=json.dumps(event.context),
                created_at=event.created_at
            )
            session.add(db_obj)
        return event

    def list_events_for_incident(self, incident_id: str) -> List[IncidentEvent]:
        with get_db_session() as session:
            rows = session.query(IncidentEventModel).filter(IncidentEventModel.entity_id == incident_id).order_by(IncidentEventModel.created_at.asc()).all()
            return [self._model_to_event(r) for r in rows]

    def _model_to_event(self, row: IncidentEventModel) -> IncidentEvent:
        return IncidentEvent(
            id=row.id,
            event_type=EventType(row.event_type),
            entity_id=row.entity_id,
            actor=IncidentActor(
                id=row.actor_id,
                name=row.actor_name,
                role=ActorRole(row.actor_role)
            ),
            previous_state=row.previous_state,
            new_state=row.new_state,
            reason=row.reason,
            context=json.loads(row.context or "{}"),
            created_at=row.created_at
        )

    # =========================================================================
    # MEDICAL REFERRALS & CONCURRENT BED RESERVATION
    # =========================================================================
    def insert_referral(self, ref: MedicalReferralRecord) -> MedicalReferralRecord:
        with get_db_session() as session:
            db_obj = MedicalReferralModel(
                id=ref.id,
                incident_id=ref.incident_id,
                hospital_id=ref.hospital_id,
                resource_id=ref.resource_id,
                estimated_arrival_minutes=ref.estimated_arrival_minutes,
                estimated_patient_count=ref.estimated_patient_count,
                patient_condition=ref.patient_condition,
                severity=ref.severity,
                treatment_required=ref.treatment_required,
                status=ref.status,
                created_at=ref.created_at,
                updated_at=ref.updated_at
            )
            session.add(db_obj)
        return ref

    def update_referral(self, ref: MedicalReferralRecord) -> MedicalReferralRecord:
        with get_db_session() as session:
            db_obj = session.query(MedicalReferralModel).filter(MedicalReferralModel.id == ref.id).first()
            if db_obj:
                db_obj.status = ref.status
                db_obj.estimated_arrival_minutes = ref.estimated_arrival_minutes
                db_obj.updated_at = ref.updated_at
        return ref

    def get_referral(self, ref_id: str) -> Optional[MedicalReferralRecord]:
        with get_db_session() as session:
            obj = session.query(MedicalReferralModel).filter(MedicalReferralModel.id == ref_id).first()
            if not obj:
                return None
            return self._model_to_referral(obj)

    def list_referrals(self, hospital_id: Optional[str] = None) -> List[MedicalReferralRecord]:
        with get_db_session() as session:
            q = session.query(MedicalReferralModel)
            if hospital_id:
                q = q.filter(MedicalReferralModel.hospital_id == hospital_id)
            rows = q.order_by(MedicalReferralModel.created_at.desc()).all()
            return [self._model_to_referral(r) for r in rows]

    def _model_to_referral(self, row: MedicalReferralModel) -> MedicalReferralRecord:
        return MedicalReferralRecord(
            id=row.id,
            incident_id=row.incident_id,
            hospital_id=row.hospital_id,
            resource_id=row.resource_id,
            estimated_arrival_minutes=row.estimated_arrival_minutes,
            estimated_patient_count=row.estimated_patient_count,
            patient_condition=row.patient_condition,
            severity=row.severity,
            treatment_required=row.treatment_required,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at
        )

    # Concurrency safe hospital bed reservation using row-level locking
    def reserve_hospital_beds_atomic(self, hospital_id: str, patients_count: int) -> Tuple[bool, int, str]:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            q = session.query(HospitalModel).filter(HospitalModel.id == hospital_id)
            if is_pg:
                q = q.with_for_update()
            hosp = q.first()
            if not hosp:
                return False, 0, "Hospital not found"
            
            if hosp.available_beds >= patients_count:
                hosp.available_beds -= patients_count
                hosp.updated_at = utc_now_iso()
                return True, hosp.available_beds, f"Allocated {patients_count} beds. Remaining: {hosp.available_beds}"
            else:
                return False, hosp.available_beds, f"Insufficient beds (Requested {patients_count}, Available {hosp.available_beds})"

    # =========================================================================
    # SHELTERS CRUD & CONCURRENT OCCUPANCY UPDATES
    # =========================================================================
    def insert_shelter(self, shelter: ShelterRecord) -> ShelterRecord:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            existing = session.query(ShelterModel).filter(ShelterModel.id == shelter.id).first()
            if existing:
                existing.name = shelter.name
                existing.latitude = shelter.latitude
                existing.longitude = shelter.longitude
                existing.address = shelter.address
                existing.capacity = shelter.capacity
                existing.current_occupancy = shelter.current_occupancy
                existing.operational_status = shelter.operational_status
                existing.supplies_status = shelter.supplies_status
                existing.updated_at = shelter.updated_at
            else:
                db_obj = ShelterModel(
                    id=shelter.id,
                    name=shelter.name,
                    latitude=shelter.latitude,
                    longitude=shelter.longitude,
                    address=shelter.address,
                    capacity=shelter.capacity,
                    current_occupancy=shelter.current_occupancy,
                    operational_status=shelter.operational_status,
                    supplies_status=shelter.supplies_status,
                    updated_at=shelter.updated_at,
                    geom=f"SRID=4326;POINT({shelter.longitude} {shelter.latitude})" if is_pg else None
                )
                session.add(db_obj)
        return shelter

    def update_shelter(self, shelter: ShelterRecord) -> ShelterRecord:
        with get_db_session() as session:
            obj = session.query(ShelterModel).filter(ShelterModel.id == shelter.id).first()
            if obj:
                obj.current_occupancy = shelter.current_occupancy
                obj.operational_status = shelter.operational_status
                obj.supplies_status = shelter.supplies_status
                obj.updated_at = shelter.updated_at
        return shelter

    def list_shelters(self) -> List[ShelterRecord]:
        with get_db_session() as session:
            rows = session.query(ShelterModel).order_by(ShelterModel.id.asc()).all()
            return [self._model_to_shelter(r) for r in rows]

    def _model_to_shelter(self, row: ShelterModel) -> ShelterRecord:
        return ShelterRecord(
            id=row.id,
            name=row.name,
            latitude=row.latitude,
            longitude=row.longitude,
            address=row.address,
            capacity=row.capacity,
            current_occupancy=row.current_occupancy,
            operational_status=row.operational_status,
            supplies_status=row.supplies_status,
            updated_at=row.updated_at
        )

    # Concurrency safe shelter occupancy update using row-level locking
    def update_shelter_occupancy_atomic(self, shelter_id: str, new_occupancy: int) -> Tuple[bool, int, str]:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            q = session.query(ShelterModel).filter(ShelterModel.id == shelter_id)
            if is_pg:
                q = q.with_for_update()
            sh = q.first()
            if not sh:
                return False, 0, "Shelter not found"
            
            bounded = max(0, min(sh.capacity, new_occupancy))
            sh.current_occupancy = bounded
            if sh.current_occupancy >= sh.capacity:
                sh.operational_status = "Full"
            elif sh.operational_status == "Full" and sh.current_occupancy < sh.capacity:
                sh.operational_status = "Open"
            sh.updated_at = utc_now_iso()
            return True, sh.current_occupancy, f"Shelter occupancy updated to {sh.current_occupancy}/{sh.capacity}"

    # =========================================================================
    # POSTGIS GEOSPATIAL SPATIAL QUERIES
    # =========================================================================
    def find_nearest_responders(self, lat: float, lon: float, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Calculates geodesic distance from (lat, lon) to available responders.
        Uses PostGIS ST_Distance(geography) on PostgreSQL, with Haversine fallback on SQLite.
        """
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            if is_pg and settings.ENABLE_POSTGIS:
                sql = text("""
                    SELECT id, name, type, status, latitude, longitude,
                           ST_Distance(
                               geom::geography,
                               ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                           ) / 1000.0 AS distance_km
                    FROM resources
                    WHERE status = 'Available'
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                    LIMIT :limit;
                """)
                res = session.execute(sql, {"lat": lat, "lon": lon, "limit": limit}).fetchall()
                return [
                    {
                        "id": r.id, "name": r.name, "type": r.type,
                        "status": r.status, "latitude": r.latitude,
                        "longitude": r.longitude, "distance_km": round(r.distance_km, 2)
                    }
                    for r in res
                ]
            else:
                # Standard Haversine distance for non-PostGIS/SQLite environments
                rows = session.query(ResourceModel).filter(ResourceModel.status == "Available").all()
                results = []
                for r in rows:
                    dist = self._haversine_km(lat, lon, r.latitude, r.longitude)
                    results.append({
                        "id": r.id, "name": r.name, "type": r.type,
                        "status": r.status, "latitude": r.latitude,
                        "longitude": r.longitude, "distance_km": round(dist, 2)
                    })
                results.sort(key=lambda x: x["distance_km"])
                return results[:limit]

    def find_nearest_hospitals(self, lat: float, lon: float, min_beds: int = 1, limit: int = 3) -> List[Dict[str, Any]]:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            if is_pg and settings.ENABLE_POSTGIS:
                sql = text("""
                    SELECT id, name, available_beds, total_beds, latitude, longitude,
                           ST_Distance(
                               geom::geography,
                               ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                           ) / 1000.0 AS distance_km
                    FROM hospitals
                    WHERE available_beds >= :min_beds
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                    LIMIT :limit;
                """)
                res = session.execute(sql, {"lat": lat, "lon": lon, "min_beds": min_beds, "limit": limit}).fetchall()
                return [
                    {
                        "id": r.id, "name": r.name, "available_beds": r.available_beds,
                        "total_beds": r.total_beds, "latitude": r.latitude,
                        "longitude": r.longitude, "distance_km": round(r.distance_km, 2)
                    }
                    for r in res
                ]
            else:
                rows = session.query(HospitalModel).filter(HospitalModel.available_beds >= min_beds).all()
                results = []
                for h in rows:
                    dist = self._haversine_km(lat, lon, h.latitude, h.longitude)
                    results.append({
                        "id": h.id, "name": h.name, "available_beds": h.available_beds,
                        "total_beds": h.total_beds, "latitude": h.latitude,
                        "longitude": h.longitude, "distance_km": round(dist, 2)
                    })
                results.sort(key=lambda x: x["distance_km"])
                return results[:limit]

    def find_nearest_shelters(self, lat: float, lon: float, limit: int = 3) -> List[Dict[str, Any]]:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            if is_pg and settings.ENABLE_POSTGIS:
                sql = text("""
                    SELECT id, name, address, capacity, current_occupancy, operational_status,
                           ST_Distance(
                               geom::geography,
                               ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                           ) / 1000.0 AS distance_km
                    FROM shelters
                    WHERE operational_status != 'Closed'
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                    LIMIT :limit;
                """)
                res = session.execute(sql, {"lat": lat, "lon": lon, "limit": limit}).fetchall()
                return [
                    {
                        "id": r.id, "name": r.name, "address": r.address,
                        "capacity": r.capacity, "current_occupancy": r.current_occupancy,
                        "operational_status": r.operational_status, "distance_km": round(r.distance_km, 2)
                    }
                    for r in res
                ]
            else:
                rows = session.query(ShelterModel).filter(ShelterModel.operational_status != "Closed").all()
                results = []
                for s in rows:
                    dist = self._haversine_km(lat, lon, s.latitude, s.longitude)
                    results.append({
                        "id": s.id, "name": s.name, "address": s.address,
                        "capacity": s.capacity, "current_occupancy": s.current_occupancy,
                        "operational_status": s.operational_status, "distance_km": round(dist, 2)
                    })
                results.sort(key=lambda x: x["distance_km"])
                return results[:limit]

    def query_incidents_within_radius(self, lat: float, lon: float, radius_km: float) -> List[IncidentRecord]:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            if is_pg and settings.ENABLE_POSTGIS:
                sql = text("""
                    SELECT id FROM incidents
                    WHERE ST_DWithin(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                        :radius_meters
                    );
                """)
                rows = session.execute(sql, {"lat": lat, "lon": lon, "radius_meters": radius_km * 1000.0}).fetchall()
                ids = [r.id for r in rows]
                matches = session.query(IncidentModel).filter(IncidentModel.id.in_(ids)).all()
                return [self._model_to_incident(m) for m in matches]
            else:
                all_inc = session.query(IncidentModel).all()
                res = []
                for i in all_inc:
                    if self._haversine_km(lat, lon, i.latitude, i.longitude) <= radius_km:
                        res.append(self._model_to_incident(i))
                return res

    @staticmethod
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371.0  # Earth's radius in kilometers
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = math.sin(d_lat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c

    # =========================================================================
    # FIELD ALERTS & MISSION COMMUNICATIONS
    # =========================================================================
    def insert_field_alert(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with get_db_session() as session:
            is_pg = not str(session.bind.url).startswith("sqlite")
            geom_wkt = f"SRID=4326;POINT({data['longitude']} {data['latitude']})" if is_pg and data.get("latitude") and data.get("longitude") else None
            from app.db.models_sql import FieldAlertModel
            alert = FieldAlertModel(
                id=data["id"],
                rescuer_id=data["rescuer_id"],
                rescuer_name=data["rescuer_name"],
                active_assignment_id=data.get("active_assignment_id"),
                original_incident_id=data.get("original_incident_id"),
                new_incident_id=data.get("new_incident_id"),
                emergency_type=data["emergency_type"],
                description=data["description"],
                latitude=data.get("latitude"),
                longitude=data.get("longitude"),
                location_description=data.get("location_description"),
                people_affected=data.get("people_affected", 1),
                casualties=data.get("casualties", 0),
                requires_rescue=bool(data.get("requires_rescue", False)),
                requires_medical=bool(data.get("requires_medical", False)),
                hazard_info=data.get("hazard_info"),
                urgency=data.get("urgency", "High"),
                status=data.get("status", "Reported"),
                command_decision=data.get("command_decision"),
                decision_reason=data.get("decision_reason"),
                created_at=data.get("created_at", utc_now_iso()),
                updated_at=data.get("updated_at", utc_now_iso()),
                geom=geom_wkt
            )
            session.add(alert)
        return data

    def list_field_alerts(self, rescuer_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with get_db_session() as session:
            from app.db.models_sql import FieldAlertModel
            q = session.query(FieldAlertModel)
            if rescuer_id:
                q = q.filter(FieldAlertModel.rescuer_id == rescuer_id)
            rows = q.order_by(FieldAlertModel.created_at.desc()).all()
            return [
                {
                    "id": r.id,
                    "rescuer_id": r.rescuer_id,
                    "rescuer_name": r.rescuer_name,
                    "active_assignment_id": r.active_assignment_id,
                    "original_incident_id": r.original_incident_id,
                    "new_incident_id": r.new_incident_id,
                    "emergency_type": r.emergency_type,
                    "description": r.description,
                    "latitude": r.latitude,
                    "longitude": r.longitude,
                    "location_description": r.location_description,
                    "people_affected": r.people_affected,
                    "casualties": r.casualties,
                    "requires_rescue": r.requires_rescue,
                    "requires_medical": r.requires_medical,
                    "hazard_info": r.hazard_info,
                    "urgency": r.urgency,
                    "status": r.status,
                    "command_decision": r.command_decision,
                    "decision_reason": r.decision_reason,
                    "created_at": r.created_at,
                    "updated_at": r.updated_at
                }
                for r in rows
            ]

    def update_field_alert(self, alert_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with get_db_session() as session:
            from app.db.models_sql import FieldAlertModel
            alert = session.query(FieldAlertModel).filter(FieldAlertModel.id == alert_id).first()
            if not alert:
                return None
            for k, v in updates.items():
                if hasattr(alert, k):
                    setattr(alert, k, v)
            alert.updated_at = utc_now_iso()
            return {
                "id": alert.id,
                "active_assignment_id": alert.active_assignment_id,
                "original_incident_id": alert.original_incident_id,
                "new_incident_id": alert.new_incident_id,
                "status": alert.status,
                "command_decision": alert.command_decision,
                "decision_reason": alert.decision_reason,
                "updated_at": alert.updated_at
            }

    def insert_mission_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with get_db_session() as session:
            from app.db.models_sql import MissionMessageModel
            msg = MissionMessageModel(
                id=data["id"],
                mission_id=data["mission_id"],
                field_alert_id=data.get("field_alert_id"),
                sender_id=data["sender_id"],
                sender_name=data["sender_name"],
                sender_role=data["sender_role"],
                message_type=data.get("message_type", "chat"),
                content=data["content"],
                priority=data.get("priority", "Normal"),
                acknowledged=bool(data.get("acknowledged", False)),
                acknowledged_at=data.get("acknowledged_at"),
                created_at=data.get("created_at", utc_now_iso())
            )
            session.add(msg)
        return data

    def list_mission_messages(self, mission_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with get_db_session() as session:
            from app.db.models_sql import MissionMessageModel
            from sqlalchemy import or_
            q = session.query(MissionMessageModel)
            if mission_id:
                q = q.filter(or_(MissionMessageModel.mission_id == mission_id, MissionMessageModel.field_alert_id == mission_id))
            rows = q.order_by(MissionMessageModel.created_at.asc()).all()
            return [
                {
                    "id": r.id,
                    "mission_id": r.mission_id,
                    "field_alert_id": r.field_alert_id,
                    "sender_id": r.sender_id,
                    "sender_name": r.sender_name,
                    "sender_role": r.sender_role,
                    "message_type": r.message_type,
                    "content": r.content,
                    "priority": r.priority,
                    "acknowledged": r.acknowledged,
                    "acknowledged_at": r.acknowledged_at,
                    "created_at": r.created_at
                }
                for r in rows
            ]

    def acknowledge_mission_message(self, message_id: str) -> Optional[Dict[str, Any]]:
        with get_db_session() as session:
            from app.db.models_sql import MissionMessageModel
            msg = session.query(MissionMessageModel).filter(MissionMessageModel.id == message_id).first()
            if not msg:
                return None
            msg.acknowledged = True
            msg.acknowledged_at = utc_now_iso()
            return {
                "id": msg.id,
                "acknowledged": msg.acknowledged,
                "acknowledged_at": msg.acknowledged_at
            }

# Global singleton store instance
db_store = PostgresOperationalStore()
