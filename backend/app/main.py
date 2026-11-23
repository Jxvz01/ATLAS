"""
FastAPI Server for ATLAS: Adaptive Terrain Intelligence & Life-saving Action System.
Connects Admin, Hospital, Rescuer, and Citizen portals to a unified real-time state.
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.database import (
    db, Incident, Resource, Hospital, Assignment, RoadBlockage, Alert, IncomingPatient
)
from app.engine import (
    calculate_priority_score, evaluate_incident_assignment,
    run_global_recomputation, DEFAULT_WEIGHTS
)
from app.geospatial import generate_safe_route
from app.api.v1.router import router as v1_router

app = FastAPI(
    title="ATLAS Intelligence Engine API",
    description="Disaster intelligence and adaptive response coordination backend.",
    version="1.0.0"
)

# Mount Version 1 Modular Incident Engine & Architecture
app.include_router(v1_router)

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
    new_num = len(db.incidents) + 101
    inc_id = f"INC-{new_num}"
    
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

    assign_id = f"ASG-{len(db.assignments) + 1:03d}"
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

    # If medical/trauma, create simulated incoming patient to nearest hospital
    if any(k in inc.type.lower() for k in ["medical", "trapped", "flooding"]) and inc.affected_population > 0:
        hosp = list(db.hospitals.values())[0] # Pick primary hospital
        pat_id = f"PAT-{len(db.incoming_patients) + 1:03d}"
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

    db.log_event("ASSIGNMENT_DISPATCHED", f"Dispatched unit {res.name} to incident {inc.id}. Estimated distance: {dist} km.", assign_id)
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
