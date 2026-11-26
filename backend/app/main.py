"""
FastAPI Server for ATLAS: Adaptive Terrain Intelligence & Life-saving Action System.
Connects Admin, Hospital, Rescuer, and Citizen portals to a unified real-time state.
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import uuid

from app.database import (
    db, Incident, Resource, Hospital, Assignment, RoadBlockage, Alert, IncomingPatient
)
from app.engine import (
    calculate_priority_score, evaluate_incident_assignment,
    run_global_recomputation, DEFAULT_WEIGHTS
)
from app.geospatial import generate_safe_route
from app.api.v1.router import router as v1_router
from app.api.v2_intel import router as v2_intel_router

app = FastAPI(
    title="ATLAS Intelligence Engine API",
    description="Disaster intelligence and adaptive response coordination backend.",
    version="1.0.0"
)

# Mount Version 1 Modular Incident Engine & Architecture
app.include_router(v1_router)
app.include_router(v2_intel_router)

# Enable CORS for frontend Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---
class CreateIncidentRequest(BaseModel):
    type: str
    description: str
    latitude: float
    longitude: float
    severity: int = Field(3, ge=1, le=5)
    urgency: int = Field(3, ge=1, le=5)
    affected_population: int = Field(1, ge=0)
    source: str = "Citizen SOS"
    vulnerability: int = Field(3, ge=1, le=5)
    required_capabilities: Optional[List[str]] = None

class UpdateIncidentStatusRequest(BaseModel):
    status: Optional[str] = None
    priority_level: Optional[str] = None
    severity: Optional[int] = None
    urgency: Optional[int] = None

class CreateAssignmentRequest(BaseModel):
    incident_id: str
    resource_id: str
    explanation: Optional[str] = None

class UpdateAssignmentRequest(BaseModel):
    assignment_status: str

class UpdateHospitalCapacityRequest(BaseModel):
    available_beds: Optional[int] = None
    icu_capacity: Optional[int] = None
    emergency_capacity: Optional[int] = None
    available_medical_personnel: Optional[int] = None
    operational_status: Optional[str] = None

class CreateBlockageRequest(BaseModel):
    road_id: str
    latitude: float
    longitude: float
    reason: str

class UpdateResourceStatusRequest(BaseModel):
    status: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

# --- Scenario & Metrics Endpoints ---

@app.get("/api/scenario/state")
def get_scenario_state():
    """Returns the complete synchronized state for any connecting portal."""
    active_incidents = [i for i in db.incidents.values() if i.status in ["Active", "Assigned", "In Progress"]]
    critical_incidents = [i for i in active_incidents if i.priority_level == "Critical"]
    available_units = [r for r in db.resources.values() if r.status == "Available"]
    active_units = [r for r in db.resources.values() if r.status in ["Assigned", "En route", "On scene"]]
    operational_hospitals = [h for h in db.hospitals.values() if h.operational_status == "Operational"]
    affected_pop = sum(i.affected_population for i in active_incidents)
    unassigned_count = len([i for i in active_incidents if i.status == "Active"])

    metrics = {
        "active_incidents": len(active_incidents),
        "critical_incidents": len(critical_incidents),
        "available_rescue_units": len(available_units),
        "active_rescue_units": len(active_units),
        "operational_hospitals": len(operational_hospitals),
        "estimated_affected_people": affected_pop,
        "pending_incidents": unassigned_count
    }

    return {
        "scenario_name": db.seed_raw.get("scenario_name", "Mysuru Flood Crisis 2026"),
        "disclaimer": "SIMULATION | NOT LIVE EMERGENCY DATA",
        "center": db.seed_raw.get("center", [12.2958, 76.6394]),
        "zoom": db.seed_raw.get("zoom", 13),
        "metrics": metrics,
        "incidents": list(db.incidents.values()),
        "resources": list(db.resources.values()),
        "hospitals": list(db.hospitals.values()),
        "assignments": list(db.assignments.values()),
        "road_blockages": list(db.road_blockages.values()),
        "hazards": db.hazards,
        "alerts": db.alerts,
        "incoming_patients": list(db.incoming_patients.values()),
        "shelters": list(db.shelters.values()),
        "activity_logs": db.activity_logs[:50]
    }

# --- Incidents Endpoints ---

@app.get("/api/incidents")
def list_incidents():
    # Update priority scores dynamically
    for inc in db.incidents.values():
        score, level = calculate_priority_score(inc.dict())
        inc.priority_score = score
        inc.priority_level = level
    return list(db.incidents.values())

@app.post("/api/incidents")
def create_incident(req: CreateIncidentRequest):
    import uuid
    inc_id = f"INC-{uuid.uuid4().hex[:5].upper()}"
    
    score, level = calculate_priority_score(req.dict())

    inc = Incident(
        id=inc_id,
        type=req.type,
        description=req.description,
        latitude=req.latitude,
        longitude=req.longitude,
        severity=req.severity,
        urgency=req.urgency,
        confidence=0.95,
        affected_population=req.affected_population,
        vulnerability=req.vulnerability,
        priority_score=score,
        priority_level=level,
        status="Active",
        source=req.source,
        required_capabilities=req.required_capabilities or []
    )
    db.incidents[inc_id] = inc
    db.log_event("NEW_INCIDENT", f"New {level} priority incident {inc_id} reported ({req.type}) at ({req.latitude:.4f}, {req.longitude:.4f}).", inc_id)
    
    # Persist into Supabase PostgreSQL
    try:
        from app.db.postgres_store import db_store
        from app.domain.models import IncidentRecord
        from app.domain.enums import IncidentType, IncidentCategory, IncidentStatus, VerificationStatus, PriorityLevel, ReportSource
        
        type_enum = IncidentType.OTHER
        for it in IncidentType:
            if it.value.lower() == req.type.lower() or it.name.lower() == req.type.lower():
                type_enum = it
                break

        prio_enum = PriorityLevel.MEDIUM
        for p in PriorityLevel:
            if p.value.lower() == level.lower():
                prio_enum = p
                break

        inc_record = IncidentRecord(
            id=inc_id,
            type=type_enum,
            category=IncidentCategory.NATURAL_DISASTER,
            severity=req.severity,
            urgency=req.urgency,
            confidence=0.95,
            priority_score=min(5.0, max(0.0, score)),
            priority_level=prio_enum,
            status=IncidentStatus.ACTIVE,
            verification_status=VerificationStatus.REPORTED,
            latitude=req.latitude,
            longitude=req.longitude,
            location_description=f"Lat {req.latitude:.4f}, Lon {req.longitude:.4f}",
            source=ReportSource.CIVILIAN_SOS,
            people_affected=req.affected_population,
            casualties=0,
            description=req.description,
            required_capabilities=req.required_capabilities or []
        )
        db_store.insert_incident(inc_record)
    except Exception as e:
        print(f"Warning: PostgreSQL persistence failed for {inc_id}: {e}")

    return inc

@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str):
    if incident_id not in db.incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = db.incidents[incident_id]
    score, level = calculate_priority_score(inc.dict())
    inc.priority_score = score
    inc.priority_level = level
    return inc

@app.patch("/api/incidents/{incident_id}")
def update_incident(incident_id: str, req: UpdateIncidentStatusRequest):
    if incident_id not in db.incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = db.incidents[incident_id]
    if req.status is not None:
        inc.status = req.status
    if req.severity is not None:
        inc.severity = req.severity
    if req.urgency is not None:
        inc.urgency = req.urgency
    
    score, level = calculate_priority_score(inc.dict())
    inc.priority_score = score
    inc.priority_level = req.priority_level or level
    inc.updated_at = datetime.utcnow().isoformat()
    db.log_event("INCIDENT_UPDATE", f"Incident {incident_id} updated: Status={inc.status}, Priority={inc.priority_level}", incident_id)

    try:
        from app.db.session import get_db_session
        from app.db.models_sql import IncidentModel
        with get_db_session() as session:
            row = session.query(IncidentModel).filter(IncidentModel.id == incident_id).first()
            if row:
                row.status = inc.status
                row.severity = inc.severity
                row.urgency = inc.urgency
                row.priority_score = inc.priority_score
                row.priority_level = inc.priority_level
                row.updated_at = inc.updated_at
    except Exception as e:
        print(f"Warning: Incident update PG persist failed: {e}")

    return inc

# --- Resources Endpoints ---

@app.get("/api/resources")
def list_resources():
    return list(db.resources.values())

@app.get("/api/resources/{resource_id}")
def get_resource(resource_id: str):
    if resource_id not in db.resources:
        raise HTTPException(status_code=404, detail="Resource not found")
    return db.resources[resource_id]

@app.patch("/api/resources/{resource_id}")
def update_resource(resource_id: str, req: UpdateResourceStatusRequest):
    if resource_id not in db.resources:
        raise HTTPException(status_code=404, detail="Resource not found")
    res = db.resources[resource_id]
    old_status = res.status
    res.status = req.status
    if req.latitude is not None and req.longitude is not None:
        res.latitude = req.latitude
        res.longitude = req.longitude
    res.updated_at = datetime.utcnow().isoformat()
    db.log_event("RESOURCE_STATUS_CHANGE", f"Resource {res.name} ({resource_id}) changed status from {old_status} to {req.status}", resource_id)
    return res

# --- Hospitals Endpoints ---

@app.get("/api/hospitals")
def list_hospitals():
    return list(db.hospitals.values())

@app.patch("/api/hospitals/{hospital_id}")
def update_hospital(hospital_id: str, req: UpdateHospitalCapacityRequest):
    if hospital_id not in db.hospitals:
        raise HTTPException(status_code=404, detail="Hospital not found")
    hosp = db.hospitals[hospital_id]
    if req.available_beds is not None:
        hosp.available_beds = req.available_beds
    if req.icu_capacity is not None:
        hosp.icu_capacity = req.icu_capacity
    if req.emergency_capacity is not None:
        hosp.emergency_capacity = req.emergency_capacity
    if req.available_medical_personnel is not None:
        hosp.available_medical_personnel = req.available_medical_personnel
    if req.operational_status is not None:
        hosp.operational_status = req.operational_status
    hosp.updated_at = datetime.utcnow().isoformat()
    db.log_event("HOSPITAL_CAPACITY_CHANGE", f"Hospital {hosp.name} updated: Status={hosp.operational_status}, Beds Available={hosp.available_beds}/{hosp.total_beds}", hospital_id)

    try:
        from app.db.session import get_db_session
        from app.db.models_sql import HospitalModel
        with get_db_session() as session:
            db_hosp = session.query(HospitalModel).filter(HospitalModel.id == hospital_id).first()
            if db_hosp:
                db_hosp.available_beds = hosp.available_beds
                db_hosp.icu_capacity = hosp.icu_capacity
                db_hosp.emergency_capacity = hosp.emergency_capacity
                db_hosp.available_medical_personnel = hosp.available_medical_personnel
                db_hosp.operational_status = hosp.operational_status
                db_hosp.updated_at = hosp.updated_at
    except Exception as e:
        print(f"Warning: Hospital capacity PG persist failed: {e}")

    return hosp

# --- Intelligence & Allocations Endpoints ---

@app.post("/api/engine/evaluate-incident/{incident_id}")
def evaluate_incident(incident_id: str):
    if incident_id not in db.incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = db.incidents[incident_id]
    res_list = [r.dict() for r in db.resources.values()]
    blk_list = [b.dict() for b in db.road_blockages.values()]
    eval_res = evaluate_incident_assignment(inc.dict(), res_list, blk_list)
    return eval_res.to_dict()

@app.post("/api/engine/recompute")
def recompute_all_allocations():
    inc_list = [i.dict() for i in db.incidents.values()]
    res_list = [r.dict() for r in db.resources.values()]
    blk_list = [b.dict() for b in db.road_blockages.values()]
    results = run_global_recomputation(inc_list, res_list, blk_list)
    db.log_event("ENGINE_RECOMPUTE", f"Global allocation engine recomputed recommendations for {len(results)} active incident(s).")
    return [r.to_dict() for r in results]

@app.get("/api/assignments")
def list_assignments():
    return list(db.assignments.values())

@app.post("/api/assignments")
def assign_resource(req: CreateAssignmentRequest):
    if req.incident_id not in db.incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    if req.resource_id not in db.resources:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    inc = db.incidents[req.incident_id]
    res = db.resources[req.resource_id]

    # Calculate safe routing
    blk_list = [b.dict() for b in db.road_blockages.values()]
    coords, dist, is_detour = generate_safe_route(res.latitude, res.longitude, inc.latitude, inc.longitude, blk_list)

    import uuid
    assign_id = f"ASG-{uuid.uuid4().hex[:5].upper()}"
    explanation = req.explanation or f"Assigned {res.name} to {inc.id} ({inc.type}) via shortest verified route ({dist} km)."

    assignment = Assignment(
        id=assign_id,
        incident_id=req.incident_id,
        resource_id=req.resource_id,
        route_geometry=coords,
        route_distance_km=dist,
        assignment_status="Dispatched",
        explanation=explanation
    )
    db.assignments[assign_id] = assignment

    # Update states
    res.status = "Assigned"
    res.current_assignment_id = assign_id
    inc.status = "Assigned"

    # If medical/trauma, create incoming patient referral to nearest hospital
    created_referral = None
    if any(k in inc.type.lower() for k in ["medical", "trapped", "flooding"]) and inc.affected_population > 0:
        hosp = list(db.hospitals.values())[0] # Pick primary hospital
        pat_id = f"PAT-{uuid.uuid4().hex[:5].upper()}"
        in_patient = IncomingPatient(
            id=pat_id,
            incident_id=inc.id,
            hospital_id=hosp.id,
            resource_id=res.id,
            estimated_arrival_minutes=max(8, int(dist * 3.5)),
            estimated_patient_count=min(res.capacity, inc.affected_population),
            patient_condition="Trauma / Hypothermia (Stable)" if inc.type != "Medical Emergency" else "Acute Respiratory Distress (Critical)"
        )
        db.incoming_patients[pat_id] = in_patient
        created_referral = in_patient

    db.log_event("ASSIGNMENT_DISPATCHED", f"Dispatched unit {res.name} to incident {inc.id}. Estimated distance: {dist} km.", assign_id)

    # Persist assignment, resource, and incident in PostgreSQL
    try:
        from app.db.postgres_store import db_store
        from app.db.session import get_db_session
        from app.db.models_sql import AssignmentModel, ResourceModel, IncidentModel
        with get_db_session() as session:
            existing_asg = session.query(AssignmentModel).filter(AssignmentModel.id == assign_id).first()
            if not existing_asg:
                session.add(AssignmentModel(
                    id=assign_id,
                    incident_id=req.incident_id,
                    resource_id=req.resource_id,
                    route_geometry=json.dumps(coords) if coords else None,
                    route_distance_km=dist,
                    assignment_status="Dispatched",
                    explanation=explanation,
                    assigned_at=assignment.assigned_at,
                    updated_at=assignment.updated_at
                ))
            db_res = session.query(ResourceModel).filter(ResourceModel.id == req.resource_id).first()
            if db_res:
                db_res.status = "Assigned"
                db_res.current_assignment_id = assign_id
            db_inc = session.query(IncidentModel).filter(IncidentModel.id == req.incident_id).first()
            if db_inc:
                db_inc.status = "Assigned"
        if created_referral:
            from app.domain.models import MedicalReferralRecord
            db_store.insert_referral(MedicalReferralRecord(
                id=created_referral.id,
                incident_id=created_referral.incident_id,
                hospital_id=created_referral.hospital_id,
                resource_id=created_referral.resource_id,
                estimated_arrival_minutes=created_referral.estimated_arrival_minutes,
                estimated_patient_count=created_referral.estimated_patient_count,
                patient_condition=created_referral.patient_condition,
                severity=created_referral.severity,
                status=created_referral.status
            ))
    except Exception as e:
        print(f"Warning: Assignment persist failed: {e}")

    return assignment

@app.patch("/api/assignments/{assignment_id}")
def update_assignment_status(assignment_id: str, req: UpdateAssignmentRequest):
    if assignment_id not in db.assignments:
        raise HTTPException(status_code=404, detail="Assignment not found")
    asg = db.assignments[assignment_id]
    asg.assignment_status = req.assignment_status
    asg.updated_at = datetime.utcnow().isoformat()

    # Synchronize resource & incident status
    res = db.resources.get(asg.resource_id)
    inc = db.incidents.get(asg.incident_id)

    if req.assignment_status == "Acknowledged":
        if res: res.status = "Assigned"
    elif req.assignment_status == "En Route":
        if res: res.status = "En route"
        if inc: inc.status = "In Progress"
    elif req.assignment_status == "On Scene":
        if res: res.status = "On scene"
        if inc: inc.status = "In Progress"
    elif req.assignment_status == "Completed":
        if res: 
            res.status = "Available"
            res.current_assignment_id = None
        if inc: inc.status = "Resolved"
    elif req.assignment_status == "Canceled":
        if res:
            res.status = "Available"
            res.current_assignment_id = None
        if inc: inc.status = "Active"

    db.log_event("ASSIGNMENT_STATUS_UPDATE", f"Assignment {assignment_id} updated to {req.assignment_status} for unit {res.name if res else 'Unknown'}.", assignment_id)

    # Persist status update in PostgreSQL
    try:
        from app.db.session import get_db_session
        from app.db.models_sql import AssignmentModel, ResourceModel, IncidentModel
        with get_db_session() as session:
            db_asg = session.query(AssignmentModel).filter(AssignmentModel.id == assignment_id).first()
            if db_asg:
                db_asg.assignment_status = asg.assignment_status
                db_asg.updated_at = asg.updated_at
            if res:
                db_res = session.query(ResourceModel).filter(ResourceModel.id == res.id).first()
                if db_res:
                    db_res.status = res.status
                    db_res.current_assignment_id = res.current_assignment_id
            if inc:
                db_inc = session.query(IncidentModel).filter(IncidentModel.id == inc.id).first()
                if db_inc:
                    db_inc.status = inc.status
    except Exception as e:
        print(f"Warning: Assignment status persist failed: {e}")

    return asg

# --- Road Blockages Endpoints ---

@app.get("/api/blockages")
def list_blockages():
    return list(db.road_blockages.values())

@app.post("/api/blockages")
def report_blockage(req: CreateBlockageRequest):
    blk_id = f"BLK-{len(db.road_blockages) + 1:02d}"
    blk = RoadBlockage(
        id=blk_id,
        road_id=req.road_id,
        latitude=req.latitude,
        longitude=req.longitude,
        reason=req.reason,
        status="Active"
    )
    db.road_blockages[blk_id] = blk
    db.log_event("ROAD_BLOCKAGE_REPORTED", f"Road blockage reported on {req.road_id} at ({req.latitude:.4f}, {req.longitude:.4f}): {req.reason}", blk_id)

    # Invalidate & recalculate intersecting routes of active assignments
    for asg in db.assignments.values():
        if asg.assignment_status in ["Dispatched", "Acknowledged", "En Route"]:
            res = db.resources.get(asg.resource_id)
            inc = db.incidents.get(asg.incident_id)
            if res and inc:
                blk_list = [b.dict() for b in db.road_blockages.values()]
                coords, dist, is_detour = generate_safe_route(res.latitude, res.longitude, inc.latitude, inc.longitude, blk_list)
                if is_detour:
                    asg.route_geometry = coords
                    asg.route_distance_km = dist
                    asg.explanation = f"ROUTE ADAPTED: Blockage {blk_id} detected. Alternative route calculated (+{dist:.1f} km)."
                    db.log_event("ROUTE_ADAPTED", f"Route adapted for {res.name} to avoid {blk_id}. New distance: {dist} km.", asg.id)

    return blk

@app.delete("/api/blockages/{blockage_id}")
def clear_blockage(blockage_id: str):
    if blockage_id in db.road_blockages:
        blk = db.road_blockages[blockage_id]
        blk.status = "Cleared"
        db.log_event("ROAD_BLOCKAGE_CLEARED", f"Blockage {blockage_id} cleared. Road restored to operational traffic.", blockage_id)
        return {"status": "cleared", "id": blockage_id}
    raise HTTPException(status_code=404, detail="Blockage not found")

# --- Simulation Controls Endpoints ---

@app.post("/api/simulation/new-incident")
def sim_add_critical_incident():
    # Spawns a sudden high-urgency critical incident near Saraswathipuram
    inc_id = f"INC-SIM-{len(db.incidents) + 1}"
    inc = Incident(
        id=inc_id,
        type="Trapped People",
        description="URGENT: Floodwater breach in nursing home ground ward. 8 elderly occupants requiring immediate extraction.",
        latitude=12.3015,
        longitude=76.6280,
        severity=5,
        urgency=5,
        confidence=1.0,
        affected_population=8,
        vulnerability=5,
        priority_score=4.95,
        priority_level="Critical",
        status="Active",
        source="Simulation Injection",
        required_capabilities=["water_rescue", "structural_extrication", "medical_trauma"]
    )
    db.incidents[inc_id] = inc
    db.log_event("SIM_EVENT_CRITICAL_INCIDENT", f"CRITICAL INCIDENT INJECTED: {inc_id} (Nursing Home Flood Breach, 8 affected).", inc_id)
    return inc

@app.post("/api/simulation/block-road")
def sim_block_road():
    blk_id = f"BLK-SIM-{len(db.road_blockages) + 1}"
    blk = RoadBlockage(
        id=blk_id,
        road_id="Kantharaj Urs Road Cross",
        latitude=12.2980,
        longitude=76.6340,
        reason="Electrical pole collapse across flooded thoroughfare",
        status="Active",
        avoid_radius_km=0.45
    )
    db.road_blockages[blk_id] = blk
    db.log_event("SIM_EVENT_ROAD_BLOCKED", f"SIMULATION: Road blockage injected at Kantharaj Urs Rd ({blk_id}).", blk_id)

    # Reroute active assignments
    for asg in db.assignments.values():
        if asg.assignment_status in ["Dispatched", "Acknowledged", "En Route"]:
            res = db.resources.get(asg.resource_id)
            inc = db.incidents.get(asg.incident_id)
            if res and inc:
                blk_list = [b.dict() for b in db.road_blockages.values()]
                coords, dist, is_detour = generate_safe_route(res.latitude, res.longitude, inc.latitude, inc.longitude, blk_list)
                if is_detour:
                    asg.route_geometry = coords
                    asg.route_distance_km = dist
                    asg.explanation = f"ADAPTIVE REROUTING: Switched to bypass corridor around {blk_id}."
                    db.log_event("ROUTE_ADAPTED", f"Simulation caused reroute for {res.name} to avoid {blk_id}.", asg.id)
    return blk

@app.post("/api/simulation/unit-unavailable")
def sim_unit_unavailable():
    # Find an active or available unit to disable
    target = None
    for r in db.resources.values():
        if r.status in ["Available", "Assigned"]:
            target = r
            break
    if target:
        old_status = target.status
        target.status = "Unavailable"
        db.log_event("SIM_EVENT_UNIT_UNAVAILABLE", f"SIMULATION: Unit {target.name} ({target.id}) reported mechanical pump failure / Unavailable (was {old_status}).", target.id)
        
        # If this unit had an assignment, set incident back to Active for reallocation
        if target.current_assignment_id and target.current_assignment_id in db.assignments:
            asg = db.assignments[target.current_assignment_id]
            asg.assignment_status = "Canceled"
            asg.explanation = f"Canceled because assigned unit {target.name} suffered mechanical failure."
            inc = db.incidents.get(asg.incident_id)
            if inc:
                inc.status = "Active"
                db.log_event("REALLOCATION_TRIGGERED", f"Incident {inc.id} returned to queue for re-assignment due to unit failure.", inc.id)
            target.current_assignment_id = None
        return target
    return {"message": "No units currently available to disable"}

@app.post("/api/simulation/hospital-capacity")
def sim_reduce_hospital_capacity():
    # Reduce capacity of K.R. Hospital
    hosp = db.hospitals.get("HOSP-01")
    if hosp:
        hosp.available_beds = max(2, hosp.available_beds - 25)
        hosp.icu_capacity = 1
        hosp.operational_status = "Critical"
        db.log_event("SIM_EVENT_HOSPITAL_SURGE", f"SIMULATION: K.R. Hospital ICU saturated! Available beds reduced to {hosp.available_beds}, Status changed to CRITICAL.", hosp.id)
        return hosp
    return {"message": "Hospital not found"}

@app.post("/api/simulation/restore-road")
def sim_restore_road():
    # Restore any active blockage
    for blk in db.road_blockages.values():
        if blk.status == "Active":
            blk.status = "Cleared"
            db.log_event("SIM_EVENT_ROAD_RESTORED", f"SIMULATION: Blockage {blk.id} cleared by municipal debris team.", blk.id)
            return blk
    return {"message": "No active blockages to clear"}

@app.post("/api/simulation/reset")
def sim_reset_scenario():
    db.reset_scenario()
    return {"message": "Scenario successfully reset to original seed state"}

# --- Field Reports Endpoints ---

class CreateFieldReportRequest(BaseModel):
    incident_id: str
    resource_id: str
    casualties: int = 0
    assessment: str
    road_condition: Optional[str] = None
    notes: Optional[str] = None

@app.post("/api/field-reports")
def submit_field_report(req: CreateFieldReportRequest):
    if req.incident_id not in db.incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc = db.incidents[req.incident_id]
    res = db.resources.get(req.resource_id)
    res_name = res.name if res else req.resource_id

    # Update incident live casualty count and notes
    if req.casualties > 0:
        inc.affected_population = max(inc.affected_population, req.casualties)
        inc.severity = min(5, inc.severity + 1)
        score, level = calculate_priority_score(inc.dict())
        inc.priority_score = score
        inc.priority_level = level

    msg = f"FIELD REPORT [{res_name}]: {req.assessment}. Casualties: {req.casualties}. Condition: {req.road_condition or 'Passable'}. {req.notes or ''}"
    db.log_event("FIELD_REPORT", msg, req.incident_id)

    # Persist in Supabase PostgreSQL
    try:
        from app.db.postgres_store import db_store
        from app.domain.models import IncidentReport
        from app.domain.enums import IncidentType, ReportSource, VerificationStatus
        import uuid

        rep_id = f"FLD-{uuid.uuid4().hex[:8].upper()}"
        report = IncidentReport(
            id=rep_id,
            incident_id=req.incident_id,
            source=ReportSource.RESCUER_FIELD,
            reporter_reference=req.resource_id,
            latitude=inc.latitude,
            longitude=inc.longitude,
            location_description=inc.description[:50],
            emergency_type=IncidentType.FLOODING,
            description=msg,
            people_affected=req.casualties,
            casualties=req.casualties,
            verification_status=VerificationStatus.VERIFIED
        )
        db_store.insert_report(report)
    except Exception as e:
        print(f"Warning: Field report PG persist failed: {e}")

    return {"status": "received", "incident_id": req.incident_id, "message": msg}

# --- Activity & Alerts Endpoints ---

@app.get("/api/activity")
def get_activity_log():
    return db.activity_logs[:50]

@app.get("/api/alerts")
def get_alerts():
    return db.alerts

@app.post("/api/alerts")
def create_alert(alert: Alert):
    db.alerts.insert(0, alert)
    db.log_event("BROADCAST_ALERT", f"Public emergency broadcast issued: {alert.title}", alert.id)
    return alert

# --- Medical Referrals Endpoints ---

class CreateReferralRequest(BaseModel):
    incident_id: str
    hospital_id: str
    resource_id: str
    estimated_arrival_minutes: int = 15
    estimated_patient_count: int = 1
    patient_condition: str
    severity: str = "Urgent"
    treatment_required: Optional[str] = None

class UpdateReferralRequest(BaseModel):
    status: str # En Route, Arrived, Admitted, Declined
    estimated_arrival_minutes: Optional[int] = None

@app.get("/api/referrals")
def list_referrals(hospital_id: Optional[str] = None):
    if hospital_id:
        return [p for p in db.incoming_patients.values() if p.hospital_id == hospital_id]
    return list(db.incoming_patients.values())

@app.post("/api/referrals")
def create_referral(req: CreateReferralRequest):
    import uuid
    ref_id = f"CASE-{uuid.uuid4().hex[:5].upper()}"
    patient = IncomingPatient(
        id=ref_id,
        incident_id=req.incident_id,
        hospital_id=req.hospital_id,
        resource_id=req.resource_id,
        estimated_arrival_minutes=req.estimated_arrival_minutes,
        estimated_patient_count=req.estimated_patient_count,
        patient_condition=req.patient_condition,
        severity=req.severity,
        treatment_required=req.treatment_required,
        status="En Route"
    )
    db.incoming_patients[ref_id] = patient
    
    hosp_name = db.hospitals[req.hospital_id].name if req.hospital_id in db.hospitals else req.hospital_id
    db.log_event(
        "HOSPITAL_REFERRAL_CREATED",
        f"Medical referral {ref_id} created for {req.estimated_patient_count} patient(s) -> {hosp_name} (ETA: {req.estimated_arrival_minutes} min).",
        ref_id
    )

    # Persist into Supabase PostgreSQL
    try:
        from app.db.postgres_store import db_store
        from app.domain.models import MedicalReferralRecord, IncidentEvent, IncidentActor, utc_now_iso
        from app.domain.enums import EventType, ActorRole
        rec = MedicalReferralRecord(
            id=ref_id,
            incident_id=req.incident_id,
            hospital_id=req.hospital_id,
            resource_id=req.resource_id,
            estimated_arrival_minutes=req.estimated_arrival_minutes,
            estimated_patient_count=req.estimated_patient_count,
            patient_condition=req.patient_condition,
            severity=req.severity,
            treatment_required=req.treatment_required,
            status="En Route"
        )
        db_store.insert_referral(rec)
        db_store.record_event(IncidentEvent(
            id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
            event_type=EventType.HOSPITAL_REFERRAL_CREATED,
            entity_id=req.incident_id,
            actor=IncidentActor(id=req.resource_id, name="Field Unit", role=ActorRole.RESCUER),
            previous_state=None,
            new_state="En Route",
            reason=f"Patient transport initiated to {hosp_name}",
            context={"referral_id": ref_id, "hospital_id": req.hospital_id, "patients": req.estimated_patient_count}
        ))
    except Exception as e:
        print(f"Warning: Medical referral PG persist failed: {e}")

    return patient

@app.patch("/api/referrals/{referral_id}")
def update_referral(referral_id: str, req: UpdateReferralRequest):
    if referral_id not in db.incoming_patients:
        raise HTTPException(status_code=404, detail="Referral not found")
    
    ref = db.incoming_patients[referral_id]
    old_status = ref.status
    ref.status = req.status
    if req.estimated_arrival_minutes is not None:
        ref.estimated_arrival_minutes = req.estimated_arrival_minutes

    # If referral admitted or accepted, adjust hospital available beds
    if req.status in ["Admitted", "Accepted"]:
        hosp = db.hospitals.get(ref.hospital_id)
        if hosp:
            hosp.available_beds = max(0, hosp.available_beds - ref.estimated_patient_count)
            try:
                from app.db.session import get_db_session
                from app.db.models_sql import HospitalModel
                with get_db_session() as session:
                    db_hosp = session.query(HospitalModel).filter(HospitalModel.id == hosp.id).first()
                    if db_hosp:
                        db_hosp.available_beds = hosp.available_beds
                        db_hosp.updated_at = datetime.utcnow().isoformat()
            except Exception as e:
                print(f"Warning: Hospital capacity persist on referral failed: {e}")
            db.log_event(
                "HOSPITAL_REFERRAL_ACCEPTED",
                f"Referral {referral_id} {req.status}. {ref.estimated_patient_count} bed(s) allocated at {hosp.name}. Remaining beds: {hosp.available_beds}.",
                referral_id
            )
    elif req.status == "Declined":
        db.log_event(
            "HOSPITAL_REFERRAL_DECLINED",
            f"Referral {referral_id} declined by hospital {ref.hospital_id}.",
            referral_id
        )

    # Persist update in Supabase PostgreSQL
    try:
        from app.db.postgres_store import db_store
        from app.domain.models import IncidentEvent, IncidentActor, utc_now_iso
        from app.domain.enums import EventType, ActorRole
        persisted = db_store.get_referral(referral_id)
        if persisted:
            persisted.status = req.status
            if req.estimated_arrival_minutes is not None:
                persisted.estimated_arrival_minutes = req.estimated_arrival_minutes
            persisted.updated_at = utc_now_iso()
            db_store.update_referral(persisted)
            
            event_type = EventType.HOSPITAL_REFERRAL_ACCEPTED if req.status in ["Admitted", "Accepted"] else (
                EventType.HOSPITAL_REFERRAL_DECLINED if req.status == "Declined" else EventType.STATUS_TRANSITION
            )
            db_store.record_event(IncidentEvent(
                id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
                event_type=event_type,
                entity_id=ref.incident_id,
                actor=IncidentActor(id=ref.hospital_id, name="Hospital Desk", role=ActorRole.HOSPITAL_OPERATOR),
                previous_state=old_status,
                new_state=req.status,
                reason=f"Hospital updated patient referral to {req.status}",
                context={"referral_id": referral_id}
            ))
    except Exception as e:
        print(f"Warning: Medical referral update PG persist failed: {e}")

    return ref

# --- Shelters Endpoints ---

class UpdateShelterRequest(BaseModel):
    current_occupancy: Optional[int] = None
    operational_status: Optional[str] = None
    supplies_status: Optional[str] = None

@app.get("/api/shelters")
def list_shelters():
    return list(db.shelters.values())

@app.patch("/api/shelters/{shelter_id}")
def update_shelter(shelter_id: str, req: UpdateShelterRequest):
    if shelter_id not in db.shelters:
        raise HTTPException(status_code=404, detail="Shelter not found")
    
    sh = db.shelters[shelter_id]
    if req.current_occupancy is not None:
        sh.current_occupancy = max(0, min(sh.capacity, req.current_occupancy))
    if req.operational_status is not None:
        sh.operational_status = req.operational_status
    if req.supplies_status is not None:
        sh.supplies_status = req.supplies_status
    sh.updated_at = datetime.utcnow().isoformat()

    db.log_event(
        "SHELTER_CAPACITY_UPDATED",
        f"Shelter {sh.name} capacity updated: Occupancy {sh.current_occupancy}/{sh.capacity}, Status: {sh.operational_status}.",
        shelter_id
    )

    # Persist in SQLite
    try:
        from app.db.sqlite_store import db_store
        from app.domain.models import ShelterRecord
        rec = ShelterRecord(
            id=sh.id,
            name=sh.name,
            latitude=sh.latitude,
            longitude=sh.longitude,
            address=sh.address,
            capacity=sh.capacity,
            current_occupancy=sh.current_occupancy,
            operational_status=sh.operational_status,
            supplies_status=sh.supplies_status,
            updated_at=sh.updated_at
        )
        db_store.update_shelter(rec)
    except Exception as e:
        print(f"Warning: Shelter update SQLite persist failed: {e}")

    return sh

# --- Field Alerts & Field-to-Command Communications Endpoints ---

class CreateFieldAlertRequest(BaseModel):
    rescuer_id: str
    rescuer_name: str
    active_assignment_id: Optional[str] = None
    original_incident_id: Optional[str] = None
    emergency_type: str
    description: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_description: Optional[str] = None
    people_affected: int = 1
    casualties: int = 0
    requires_rescue: bool = False
    requires_medical: bool = False
    hazard_info: Optional[str] = None
    urgency: str = "High"
    client_id: Optional[str] = None

class UpdateFieldAlertDecisionRequest(BaseModel):
    status: str # Acknowledged, Combined, Separate Unit Assigned, Dismissed
    command_decision: str
    decision_reason: Optional[str] = None

class CreateMissionMessageRequest(BaseModel):
    mission_id: Optional[str] = None
    field_alert_id: Optional[str] = None
    sender_id: str
    sender_name: str
    sender_role: str # rescuer, admin
    content: str
    priority: str = "Normal" # Normal, Priority, Urgent
    message_type: str = "chat" # chat, instruction, alert, acknowledgment
    client_id: Optional[str] = None

@app.get("/api/field-alerts")
def list_field_alerts(rescuer_id: Optional[str] = None):
    from app.db.postgres_store import db_store
    return db_store.list_field_alerts(rescuer_id=rescuer_id)

@app.post("/api/field-alerts")
def create_field_alert(req: CreateFieldAlertRequest):
    from app.db.postgres_store import db_store
    import uuid
    from datetime import datetime
    from app.engine import calculate_priority_score

    # Idempotency guard for offline retries
    if req.client_id:
        existing_alerts = db_store.list_field_alerts(rescuer_id=req.rescuer_id)
        for ea in existing_alerts:
            if ea.get("id") == req.client_id:
                inc_obj = db.incidents.get(ea.get("new_incident_id", ""))
                return {"alert": ea, "incident": inc_obj.dict() if inc_obj else {"id": ea.get("new_incident_id")}, "idempotent_replay": True}

    alert_id = req.client_id or f"ALT-{uuid.uuid4().hex[:6].upper()}"
    new_inc_id = f"INC-FLD-{uuid.uuid4().hex[:4].upper()}"

    # Default coordinates to original incident if rescuer omitted GPS
    lat = req.latitude
    lon = req.longitude
    if (lat is None or lon is None) and req.original_incident_id and req.original_incident_id in db.incidents:
        orig = db.incidents[req.original_incident_id]
        lat = orig.latitude + 0.0015
        lon = orig.longitude + 0.0015

    if lat is None: lat = 12.3168
    if lon is None: lon = 76.6496

    # Create authoritative incident record for the discovered emergency
    score, level = calculate_priority_score({
        "severity": 4 if req.urgency == "High" else (5 if req.urgency == "Critical" else 3),
        "urgency": 5 if req.requires_rescue else 3,
        "affected_population": req.people_affected,
        "vulnerability": 3
    })

    new_inc = Incident(
        id=new_inc_id,
        type=req.emergency_type,
        description=f"FIELD ALERT from {req.rescuer_name}: {req.description}",
        latitude=lat,
        longitude=lon,
        severity=4 if req.urgency == "High" else 3,
        urgency=5 if req.requires_rescue else 3,
        confidence=1.0,
        affected_population=req.people_affected,
        vulnerability=3,
        priority_score=score,
        priority_level=level,
        status="Active",
        source=f"Rescuer Field Alert ({req.rescuer_name})"
    )
    db.incidents[new_inc_id] = new_inc

    # Persist newly discovered secondary incident into PostgreSQL incidents table
    try:
        from app.domain.models import IncidentRecord
        from app.domain.enums import IncidentType, IncidentCategory, IncidentStatus, VerificationStatus, PriorityLevel, ReportSource
        type_enum = IncidentType.OTHER
        for it in IncidentType:
            if it.value.lower() == req.emergency_type.lower() or it.name.lower() == req.emergency_type.lower():
                type_enum = it
                break
        prio_enum = PriorityLevel.HIGH
        for p in PriorityLevel:
            if p.value.lower() == level.lower():
                prio_enum = p
                break
        db_store.insert_incident(IncidentRecord(
            id=new_inc_id,
            type=type_enum,
            category=IncidentCategory.PUBLIC_SAFETY,
            severity=new_inc.severity,
            urgency=new_inc.urgency,
            confidence=1.0,
            priority_score=min(5.0, max(0.0, score)),
            priority_level=prio_enum,
            status=IncidentStatus.ACTIVE,
            verification_status=VerificationStatus.VERIFIED,
            latitude=lat,
            longitude=lon,
            location_description=req.location_description or "Field discovery",
            source=ReportSource.RESCUER_FIELD,
            people_affected=req.people_affected,
            casualties=req.casualties,
            description=new_inc.description,
            required_capabilities=[]
        ))
    except Exception as e:
        print(f"Warning: Field-discovered incident PG persist failed: {e}")

    alert_dict = {
        "id": alert_id,
        "rescuer_id": req.rescuer_id,
        "rescuer_name": req.rescuer_name,
        "active_assignment_id": req.active_assignment_id,
        "original_incident_id": req.original_incident_id,
        "new_incident_id": new_inc_id,
        "emergency_type": req.emergency_type,
        "description": req.description,
        "latitude": lat,
        "longitude": lon,
        "location_description": req.location_description or "Discovered along response corridor",
        "people_affected": req.people_affected,
        "casualties": req.casualties,
        "requires_rescue": req.requires_rescue,
        "requires_medical": req.requires_medical,
        "hazard_info": req.hazard_info,
        "urgency": req.urgency,
        "status": "Reported",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }

    # Persist in Supabase
    db_store.insert_field_alert(alert_dict)
    
    # Broadcast in operational activity log
    db.log_event(
        "FIELD_ALERT_REPORTED",
        f"FIELD ALERT {alert_id}: {req.rescuer_name} reported nearby {req.emergency_type} at ({lat:.4f}, {lon:.4f}). New Incident {new_inc_id} created.",
        alert_id
    )

    # Automatically generate initial system comm message in mission thread
    mission_id = req.active_assignment_id or req.original_incident_id or new_inc_id
    db_store.insert_mission_message({
        "id": f"MSG-{uuid.uuid4().hex[:6].upper()}",
        "mission_id": mission_id,
        "field_alert_id": alert_id,
        "sender_id": req.rescuer_id,
        "sender_name": req.rescuer_name,
        "sender_role": "rescuer",
        "message_type": "alert",
        "content": f"URGENT FIELD DISCOVERY: {req.emergency_type} - {req.description} ({req.people_affected} affected). Requesting Command instructions.",
        "priority": "Urgent",
        "created_at": datetime.utcnow().isoformat()
    })

    return {"alert": alert_dict, "incident": new_inc.dict()}

@app.patch("/api/field-alerts/{alert_id}/decision")
def update_field_alert_decision(alert_id: str, req: UpdateFieldAlertDecisionRequest):
    from app.db.postgres_store import db_store
    import uuid
    from datetime import datetime

    res = db_store.update_field_alert(alert_id, {
        "status": req.status,
        "command_decision": req.command_decision,
        "decision_reason": req.decision_reason
    })
    if not res:
        raise HTTPException(status_code=404, detail="Field alert not found")

    db.log_event(
        "COMMAND_DECISION_RECORDED",
        f"COMMAND DECISION on {alert_id}: {req.status} - {req.command_decision}",
        alert_id
    )

    # Transmit formal Command instruction message into mission communications
    target_mission_id = res.get("active_assignment_id") or res.get("original_incident_id") or alert_id
    db_store.insert_mission_message({
        "id": f"MSG-{uuid.uuid4().hex[:6].upper()}",
        "mission_id": target_mission_id,
        "field_alert_id": alert_id,
        "sender_id": "SEOC-COMMAND",
        "sender_name": "Command Center Dispatch",
        "sender_role": "admin",
        "message_type": "instruction",
        "content": f"COMMAND INSTRUCTION [{req.status}]: {req.command_decision}. {req.decision_reason or ''}",
        "priority": "Urgent",
        "created_at": datetime.utcnow().isoformat()
    })

    return res

@app.get("/api/missions/{mission_id}/messages")
def get_mission_messages(mission_id: str):
    from app.db.postgres_store import db_store
    return db_store.list_mission_messages(mission_id=mission_id)

@app.post("/api/missions/{mission_id}/messages")
def send_mission_message(mission_id: str, req: CreateMissionMessageRequest):
    from app.db.postgres_store import db_store
    import uuid
    from datetime import datetime

    # Idempotency guard for offline queue retries
    if req.client_id:
        existing_msgs = db_store.list_mission_messages(mission_id=mission_id)
        for em in existing_msgs:
            if em.get("id") == req.client_id:
                return em

    msg_id = req.client_id or f"MSG-{uuid.uuid4().hex[:6].upper()}"
    msg_dict = {
        "id": msg_id,
        "mission_id": mission_id,
        "field_alert_id": req.field_alert_id,
        "sender_id": req.sender_id,
        "sender_name": req.sender_name,
        "sender_role": req.sender_role,
        "message_type": req.message_type,
        "content": req.content,
        "priority": req.priority,
        "acknowledged": False,
        "created_at": datetime.utcnow().isoformat()
    }
    db_store.insert_mission_message(msg_dict)
    return msg_dict

@app.post("/api/messages/{message_id}/acknowledge")
def acknowledge_message(message_id: str):
    from app.db.postgres_store import db_store
    res = db_store.acknowledge_mission_message(message_id)
    if not res:
        raise HTTPException(status_code=404, detail="Message not found")
    return res
