"""
Database and in-memory persistence layer for ATLAS.
Supports reproducible scenario state, atomic reset, and structured GeoJSON.
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
import json
import os
import copy
from pydantic import BaseModel, Field

DATA_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "seed_scenario.json"))

class Incident(BaseModel):
    id: str
    type: str
    description: str
    latitude: float
    longitude: float
    severity: int = Field(..., ge=1, le=5)
    urgency: int = Field(..., ge=1, le=5)
    confidence: float = Field(..., ge=0.0, le=1.0)
    affected_population: int = Field(..., ge=0)
    vulnerability: int = Field(3, ge=1, le=5)
    priority_score: float = 0.0
    priority_level: str = "Medium" # Critical, High, Medium, Low
    status: str = "Active" # Active, Assigned, In Progress, Resolved, Flagged
    source: str = "Citizen SOS"
    required_capabilities: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class Resource(BaseModel):
    id: str
    name: str
    type: str # Boat Team, Rescue Team, Ambulance, Medical Unit
    latitude: float
    longitude: float
    capabilities: List[str] = []
    status: str = "Available" # Available, Assigned, En route, On scene, Returning, Unavailable
    capacity: int = 4
    current_assignment_id: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class Hospital(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    total_beds: int
    available_beds: int
    icu_capacity: int
    emergency_capacity: int
    available_medical_personnel: int
    operational_status: str = "Operational" # Operational, Limited capacity, Critical, Closed
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class Assignment(BaseModel):
    id: str
    incident_id: str
    resource_id: str
    route_geometry: Optional[List[List[float]]] = None # [[lon, lat], ...]
    route_distance_km: float = 0.0
    assignment_status: str = "Dispatched" # Dispatched, Acknowledged, En Route, On Scene, Completed, Canceled
    explanation: str
    assigned_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class RoadBlockage(BaseModel):
    id: str
    road_id: str
    latitude: float
    longitude: float
    reason: str
    status: str = "Active" # Active, Cleared
    avoid_radius_km: float = 0.35
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class ActivityLog(BaseModel):
    id: str
    event_type: str
    message: str
    entity_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class Alert(BaseModel):
    id: str
    title: str
    description: str
    severity: str # Critical, Warning, Advisory
    target: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class IncomingPatient(BaseModel):
    id: str
    incident_id: str
    hospital_id: str
    resource_id: str
    estimated_arrival_minutes: int
    estimated_patient_count: int
    patient_condition: str
    severity: str = "Urgent"
    treatment_required: Optional[str] = None
    status: str = "En Route" # En Route, Arrived, Admitted, Declined

class Shelter(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    address: str
    capacity: int = 100
    current_occupancy: int = 0
    operational_status: str = "Open" # Open, Full, Closed
    supplies_status: str = "Adequate" # Adequate, Low, Critical
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class StateStore:
    def __init__(self):
        self.incidents: Dict[str, Incident] = {}
        self.resources: Dict[str, Resource] = {}
        self.hospitals: Dict[str, Hospital] = {}
        self.assignments: Dict[str, Assignment] = {}
        self.road_blockages: Dict[str, RoadBlockage] = {}
        self.activity_logs: List[ActivityLog] = []
        self.alerts: List[Alert] = []
        self.hazards: List[Dict[str, Any]] = []
        self.incoming_patients: Dict[str, IncomingPatient] = {}
        self.shelters: Dict[str, Shelter] = {}
        self.seed_raw: Dict[str, Any] = {}
        self.load_seed_data()

    def load_seed_data(self):
        if not os.path.exists(DATA_FILE_PATH):
            raise FileNotFoundError(f"Seed file not found at {DATA_FILE_PATH}")
        with open(DATA_FILE_PATH, "r", encoding="utf-8") as f:
            self.seed_raw = json.load(f)
        self.reset_scenario()

    def reset_scenario(self):
        self.incidents.clear()
        self.resources.clear()
        self.hospitals.clear()
        self.assignments.clear()
        self.road_blockages.clear()
        self.activity_logs.clear()
        self.alerts.clear()
        self.hazards.clear()
        self.incoming_patients.clear()
        self.shelters.clear()

        # Load hospitals
        for h in self.seed_raw.get("hospitals", []):
            self.hospitals[h["id"]] = Hospital(**h)

        # Load resources
        for r in self.seed_raw.get("resources", []):
            self.resources[r["id"]] = Resource(**r)

        # Load incidents
        seed_incident_ids = set()
        for inc in self.seed_raw.get("incidents", []):
            self.incidents[inc["id"]] = Incident(**inc)
            seed_incident_ids.add(inc["id"])

        # Load blockages
        for b in self.seed_raw.get("road_blockages", []):
            self.road_blockages[b["id"]] = RoadBlockage(**b)

        # Load alerts
        for a in self.seed_raw.get("alerts", []):
            self.alerts.append(Alert(**a))

        # Load shelters
        for s in self.seed_raw.get("shelters", []):
            self.shelters[s["id"]] = Shelter(**s)

        self.hazards = copy.deepcopy(self.seed_raw.get("hazards", []))

        # Initial log
        self.log_event("SYSTEM_RESET", "Operational scenario initialized.")

        # Hydrate authoritative state from Supabase PostgreSQL
        self.sync_from_postgres()

    def sync_from_postgres(self):
        """Loads and syncs authoritative operational records from Supabase PostgreSQL."""
        try:
            from app.db.session import get_db_session
            from app.db.models_sql import (
                IncidentModel, ResourceModel, HospitalModel, AssignmentModel,
                RoadBlockageModel, ShelterModel, MedicalReferralModel, IncidentEventModel
            )
            with get_db_session() as session:
                # 1. Hospitals
                for h in session.query(HospitalModel).all():
                    self.hospitals[h.id] = Hospital(
                        id=h.id, name=h.name, latitude=h.latitude, longitude=h.longitude,
                        total_beds=h.total_beds, available_beds=h.available_beds,
                        icu_capacity=h.icu_capacity, emergency_capacity=h.emergency_capacity,
                        available_medical_personnel=h.available_medical_personnel,
                        operational_status=h.operational_status, updated_at=h.updated_at
                    )

                # 2. Resources
                for r in session.query(ResourceModel).all():
                    self.resources[r.id] = Resource(
                        id=r.id, name=r.name, type=r.type, latitude=r.latitude, longitude=r.longitude,
                        capabilities=json.loads(r.capabilities or "[]"),
                        status=r.status, capacity=r.capacity,
                        current_assignment_id=r.current_assignment_id, updated_at=r.updated_at
                    )

                # 3. Incidents
                for inc in session.query(IncidentModel).order_by(IncidentModel.created_at.asc()).all():
                    status_raw = inc.status
                    ui_status = status_raw
                    if status_raw in ["RESOLVED", "CLOSED", "Resolved"]:
                        ui_status = "Resolved"
                    elif status_raw in ["ACTIVE", "VERIFIED", "UNDER_REVIEW", "RECEIVED", "Active"]:
                        ui_status = "Active"
                    elif status_raw in ["RESPONSE_IN_PROGRESS", "ON_SCENE", "In Progress"]:
                        ui_status = "In Progress"
                    elif status_raw == "Assigned":
                        ui_status = "Assigned"

                    self.incidents[inc.id] = Incident(
                        id=inc.id, type=inc.type, description=inc.description,
                        latitude=inc.latitude, longitude=inc.longitude,
                        severity=inc.severity, urgency=inc.urgency, confidence=inc.confidence,
                        affected_population=inc.people_affected, vulnerability=3,
                        priority_score=inc.priority_score, priority_level=inc.priority_level,
                        status=ui_status, source=inc.source,
                        required_capabilities=json.loads(inc.required_capabilities or "[]"),
                        created_at=inc.created_at, updated_at=inc.updated_at
                    )

                # 4. Assignments
                for a in session.query(AssignmentModel).order_by(AssignmentModel.assigned_at.asc()).all():
                    parsed_geom = json.loads(a.route_geometry) if isinstance(a.route_geometry, str) and a.route_geometry else a.route_geometry
                    self.assignments[a.id] = Assignment(
                        id=a.id, incident_id=a.incident_id, resource_id=a.resource_id,
                        route_geometry=parsed_geom, route_distance_km=a.route_distance_km,
                        assignment_status=a.assignment_status, explanation=a.explanation,
                        assigned_at=a.assigned_at, updated_at=a.updated_at
                    )

                # 5. Road Blockages
                for b in session.query(RoadBlockageModel).all():
                    self.road_blockages[b.id] = RoadBlockage(
                        id=b.id, road_id=b.road_id, latitude=b.latitude, longitude=b.longitude,
                        reason=b.reason, status=b.status, avoid_radius_km=b.avoid_radius_km,
                        created_at=b.created_at
                    )

                # 6. Shelters
                for s in session.query(ShelterModel).all():
                    self.shelters[s.id] = Shelter(
                        id=s.id, name=s.name, latitude=s.latitude, longitude=s.longitude,
                        address=s.address, capacity=s.capacity, current_occupancy=s.current_occupancy,
                        operational_status=s.operational_status, supplies_status=s.supplies_status,
                        updated_at=s.updated_at
                    )

                # 7. Medical Referrals (Incoming Patients)
                for ref in session.query(MedicalReferralModel).order_by(MedicalReferralModel.created_at.asc()).all():
                    self.incoming_patients[ref.id] = IncomingPatient(
                        id=ref.id, incident_id=ref.incident_id, hospital_id=ref.hospital_id,
                        resource_id=ref.resource_id, estimated_arrival_minutes=ref.estimated_arrival_minutes,
                        estimated_patient_count=ref.estimated_patient_count,
                        patient_condition=ref.patient_condition, severity=ref.severity,
                        treatment_required=ref.treatment_required, status=ref.status
                    )

                # 8. Activity Logs from Incident Events
                ev_rows = session.query(IncidentEventModel).order_by(IncidentEventModel.timestamp.desc()).limit(50).all()
                if ev_rows:
                    self.activity_logs = [
                        ActivityLog(
                            id=e.id, event_type=e.event_type,
                            message=e.reason or f"{e.event_type} on {e.entity_id}",
                            entity_id=e.entity_id, created_at=e.timestamp
                        )
                        for e in ev_rows
                    ]
        except Exception as e:
            print(f"Warning: PostgreSQL hydration failed: {e}")

    def log_event(self, event_type: str, message: str, entity_id: Optional[str] = None):
        log_id = f"LOG-{len(self.activity_logs) + 1:04d}"
        entry = ActivityLog(id=log_id, event_type=event_type, message=message, entity_id=entity_id)
        self.activity_logs.insert(0, entry) # Most recent first
        return entry

db = StateStore()
