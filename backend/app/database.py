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
    status: str = "En Route" # En Route, Arrived, Admitted

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

        # Load hospitals
        for h in self.seed_raw.get("hospitals", []):
            self.hospitals[h["id"]] = Hospital(**h)

        # Load resources
        for r in self.seed_raw.get("resources", []):
            self.resources[r["id"]] = Resource(**r)

        # Load incidents
        for inc in self.seed_raw.get("incidents", []):
            self.incidents[inc["id"]] = Incident(**inc)

        # Load blockages
        for b in self.seed_raw.get("road_blockages", []):
            self.road_blockages[b["id"]] = RoadBlockage(**b)

        # Load alerts
        for a in self.seed_raw.get("alerts", []):
            self.alerts.append(Alert(**a))

        self.hazards = copy.deepcopy(self.seed_raw.get("hazards", []))

        # Initial log
        self.log_event("SYSTEM_RESET", "Operational scenario reset to baseline state (Mysuru Flood Scenario).")

    def log_event(self, event_type: str, message: str, entity_id: Optional[str] = None):
        log_id = f"LOG-{len(self.activity_logs) + 1:04d}"
        entry = ActivityLog(id=log_id, event_type=event_type, message=message, entity_id=entity_id)
        self.activity_logs.insert(0, entry) # Most recent first
        return entry

db = StateStore()
