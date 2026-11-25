"""
RESTful Version 1 Router for ATLAS Incident Engine.
Implements CRUD, state transitions, duplicate detection, reports, and append-only event auditing.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
import uuid

from app.domain.models import IncidentRecord, IncidentReport, IncidentActor, DuplicateCandidate, utc_now_iso
from app.domain.enums import IncidentStatus, IncidentType, ActorRole
from app.domain.state_machine import IncidentLifecycleError
from app.services.incident_service import incident_service
from app.services.duplicate_service import DuplicateDetector
from app.db.sqlite_store import db_store
from app.api.v1.schemas import (
    CreateIncidentReportRequest, CreateIncidentDirectRequest, TransitionIncidentRequest,
    VerifyIncidentRequest, ResolveIncidentRequest, ReopenIncidentRequest, LinkReportRequest,
    DuplicateCheckRequest, IncidentResponse, IncidentListResponse, ReportResponse,
    ReportListResponse, EventListResponse, DuplicateCheckResponse, OperationalSummaryResponse
)
from app.api.v1.dependencies import get_current_actor, require_admin_or_commander

router = APIRouter(prefix="/api/v1", tags=["Incident Engine V1"])

# --- Health & Operational Summary ---

@router.get("/health")
def get_health():
    from app.db.session import engine
    storage_name = "Supabase PostgreSQL + PostGIS" if engine.dialect.name == "postgresql" else "SQLite Persistent WAL"
    return {
        "status": "healthy",
        "service": "ATLAS Incident Engine",
        "version": "1.0.0",
        "storage": storage_name,
        "timestamp": utc_now_iso()
    }

@router.get("/operations/summary", response_model=OperationalSummaryResponse)
def get_operational_summary():
    incidents, total_inc = db_store.list_incidents(limit=1000)
    
    active_inc = sum(1 for i in incidents if i.status in [IncidentStatus.ACTIVE, IncidentStatus.RESPONSE_IN_PROGRESS, IncidentStatus.ON_SCENE])
    verified_inc = sum(1 for i in incidents if i.status == IncidentStatus.VERIFIED or i.verification_status.value == "VERIFIED")
    resolved_inc = sum(1 for i in incidents if i.status in [IncidentStatus.RESOLVED, IncidentStatus.CLOSED])
    critical_inc = sum(1 for i in incidents if i.priority_level.value == "Critical")

    with db_store.get_connection() as conn:
        total_reports = conn.execute("SELECT COUNT(*) FROM incident_reports;").fetchone()[0]
        total_events = conn.execute("SELECT COUNT(*) FROM incident_events;").fetchone()[0]

    return OperationalSummaryResponse(
        total_incidents=total_inc,
        active_incidents=active_inc,
        verified_incidents=verified_inc,
        resolved_incidents=resolved_inc,
        critical_incidents=critical_inc,
        total_reports_processed=total_reports,
        audit_events_recorded=total_events,
        timestamp=utc_now_iso()
    )

# --- Incidents Endpoints ---

@router.get("/incidents", response_model=IncidentListResponse)
def list_incidents(
    status: Optional[str] = Query(None, description="Filter by IncidentStatus enum"),
    incident_type: Optional[str] = Query(None, description="Filter by IncidentType enum"),
    severity_min: Optional[int] = Query(None, ge=1, le=5),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    incidents, total = db_store.list_incidents(
        status=status,
        incident_type=incident_type,
        severity_min=severity_min,
        limit=limit,
        offset=offset
    )
    return IncidentListResponse(
        total=total,
        limit=limit,
        offset=offset,
        data=incidents
    )

@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str):
    inc = db_store.get_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    return IncidentResponse(data=inc)

@router.post("/incidents", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident(
    req: CreateIncidentDirectRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    # Construct initial report
    report_id = f"REP-{uuid.uuid4().hex[:8].upper()}"
    report = IncidentReport(
        id=report_id,
        source=req.source,
        reporter_reference=actor.id,
        latitude=req.latitude,
        longitude=req.longitude,
        location_description=req.location_description,
        emergency_type=req.type,
        description=req.description,
        people_affected=req.people_affected,
        casualties=req.casualties,
        requires_rescue=(req.type in [IncidentType.FLOODING, IncidentType.TRAPPED_PEOPLE, IncidentType.STRUCTURAL_COLLAPSE]),
        requires_medical=(req.type == IncidentType.MEDICAL_EMERGENCY or req.casualties > 0)
    )

    incident, persisted_rep, duplicates = incident_service.create_incident_from_report(
        report=report,
        actor=actor,
        initial_status=req.initial_status,
        severity=req.severity,
        urgency=req.urgency
    )

    return IncidentResponse(data=incident, duplicate_candidates=duplicates)

@router.post("/incidents/{incident_id}/transition", response_model=IncidentResponse)
def transition_incident_status(
    incident_id: str,
    req: TransitionIncidentRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    # Enforce role checks: Civilians cannot manually transition operational lifecycle
    if actor.role == ActorRole.CIVILIAN and req.target_status != IncidentStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Civilian actors may only cancel their own unverified requests."
        )

    try:
        updated = incident_service.transition_incident(
            incident_id=incident_id,
            target_status=req.target_status,
            actor=actor,
            reason=req.reason,
            context=req.context
        )
        return IncidentResponse(data=updated)
    except IncidentLifecycleError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/incidents/{incident_id}/verify", response_model=IncidentResponse)
def verify_incident(
    incident_id: str,
    req: VerifyIncidentRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    require_admin_or_commander(actor)
    try:
        updated = incident_service.verify_incident(
            incident_id=incident_id,
            actor=actor,
            verification_notes=req.notes
        )
        return IncidentResponse(data=updated)
    except IncidentLifecycleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/incidents/{incident_id}/resolve", response_model=IncidentResponse)
def resolve_incident(
    incident_id: str,
    req: ResolveIncidentRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    # Admins or Rescuers can resolve incidents
    if actor.role not in [ActorRole.ADMIN, ActorRole.INCIDENT_COMMANDER, ActorRole.RESCUER]:
        raise HTTPException(status_code=403, detail="Only operational staff can resolve incidents.")

    try:
        updated = incident_service.resolve_incident(
            incident_id=incident_id,
            actor=actor,
            resolution_summary=req.resolution_summary
        )
        return IncidentResponse(data=updated)
    except IncidentLifecycleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/incidents/{incident_id}/reopen", response_model=IncidentResponse)
def reopen_incident(
    incident_id: str,
    req: ReopenIncidentRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    require_admin_or_commander(actor)
    try:
        updated = incident_service.reopen_incident(
            incident_id=incident_id,
            actor=actor,
            reopen_reason=req.reopen_reason
        )
        return IncidentResponse(data=updated)
    except IncidentLifecycleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# --- Reports Endpoints ---

@router.post("/reports", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def submit_report(
    req: CreateIncidentReportRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    report_id = f"REP-{uuid.uuid4().hex[:8].upper()}"
    report = IncidentReport(
        id=report_id,
        source=req.source,
        reporter_reference=req.reporter_reference or actor.id,
        latitude=req.latitude,
        longitude=req.longitude,
        location_description=req.location_description,
        emergency_type=req.emergency_type,
        description=req.description,
        people_affected=req.people_affected,
        casualties=req.casualties,
        requires_rescue=req.requires_rescue,
        requires_medical=req.requires_medical
    )

    incident, persisted_rep, duplicates = incident_service.create_incident_from_report(
        report=report,
        actor=actor,
        initial_status=IncidentStatus.RECEIVED
    )

    return IncidentResponse(data=incident, duplicate_candidates=duplicates)

@router.get("/reports/{report_id}", response_model=ReportResponse)
def get_report(report_id: str):
    rep = db_store.get_report(report_id)
    if not rep:
        raise HTTPException(status_code=404, detail=f"Report '{report_id}' not found.")
    return ReportResponse(data=rep)

@router.get("/incidents/{incident_id}/reports", response_model=ReportListResponse)
def list_incident_reports(incident_id: str):
    inc = db_store.get_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    reports = db_store.list_reports_for_incident(incident_id)
    return ReportListResponse(data=reports)

@router.post("/reports/{report_id}/link", response_model=ReportResponse)
def link_report_to_incident(
    report_id: str,
    req: LinkReportRequest,
    actor: IncidentActor = Depends(get_current_actor)
):
    require_admin_or_commander(actor)
    try:
        linked = incident_service.link_report_to_incident(
            report_id=report_id,
            target_incident_id=req.target_incident_id,
            actor=actor,
            reason=req.reason
        )
        return ReportResponse(data=linked)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# --- Duplicate Detection ---

@router.post("/incidents/duplicate-check", response_model=DuplicateCheckResponse)
def check_duplicates(req: DuplicateCheckRequest):
    # Construct probe incident
    probe = IncidentRecord(
        id="PROBE-000",
        type=req.emergency_type,
        latitude=req.latitude,
        longitude=req.longitude,
        description=req.description
    )

    existing, _ = db_store.list_incidents(limit=500)
    candidates = DuplicateDetector.check_for_duplicates(
        new_incident=probe,
        existing_incidents=existing,
        distance_threshold=req.distance_threshold_meters or 750.0,
        time_window_hours=req.time_window_hours or 4.0
    )

    return DuplicateCheckResponse(
        candidates_count=len(candidates),
        candidates=candidates
    )

# --- Event History (Append-Only Audit Trail) ---

@router.get("/incidents/{incident_id}/events", response_model=EventListResponse)
def get_incident_events(incident_id: str):
    inc = db_store.get_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    events = db_store.list_events_for_incident(incident_id)
    return EventListResponse(data=events)
