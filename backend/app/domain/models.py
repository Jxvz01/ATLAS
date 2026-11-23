"""
Domain models for Incident Engine, Reports, Events, and Duplicate Detection.
Built with Pydantic v2 with strict validation and serialisation support.
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator
from app.domain.enums import (
    IncidentType, IncidentCategory, IncidentStatus, VerificationStatus,
    PriorityLevel, ReportSource, ActorRole, EventType
)

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class IncidentActor(BaseModel):
    id: str
    name: str
    role: ActorRole

class IncidentReport(BaseModel):
    id: str
    incident_id: Optional[str] = None
    source: ReportSource
    reporter_reference: Optional[str] = None # e.g. citizen phone or user id
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_description: Optional[str] = None
    emergency_type: IncidentType
    description: str = Field(..., min_length=3, max_length=1000)
    people_affected: int = Field(default=1, ge=0)
    casualties: int = Field(default=0, ge=0)
    requires_rescue: bool = False
    requires_medical: bool = False
    evidence_references: List[str] = Field(default_factory=list)
    verification_status: VerificationStatus = VerificationStatus.REPORTED
    created_at: str = Field(default_factory=utc_now_iso)

    @field_validator("latitude")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError("Latitude must be between -90 and 90")
        return round(v, 6)

    @field_validator("longitude")
    @classmethod
    def validate_lon(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError("Longitude must be between -180 and 180")
        return round(v, 6)

class IncidentEvent(BaseModel):
    id: str
    event_type: EventType
    entity_id: str
    actor: IncidentActor
    previous_state: Optional[str] = None
    new_state: Optional[str] = None
    reason: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=utc_now_iso)

class IncidentRecord(BaseModel):
    id: str
    type: IncidentType
    category: IncidentCategory = IncidentCategory.NATURAL_DISASTER
    severity: int = Field(default=3, ge=1, le=5)
    urgency: int = Field(default=3, ge=1, le=5)
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    priority_score: float = Field(default=0.0, ge=0.0, le=5.0)
    priority_level: PriorityLevel = PriorityLevel.MEDIUM
    status: IncidentStatus = IncidentStatus.RECEIVED
    verification_status: VerificationStatus = VerificationStatus.REPORTED
    
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_description: str = Field(default="", max_length=255)
    
    source: ReportSource = ReportSource.CIVILIAN_SOS
    source_reference: Optional[str] = None
    
    people_affected: int = Field(default=1, ge=0)
    casualties: int = Field(default=0, ge=0)
    requiring_rescue: int = Field(default=0, ge=0)
    requiring_medical: int = Field(default=0, ge=0)
    
    description: str = Field(..., min_length=3, max_length=2000)
    required_capabilities: List[str] = Field(default_factory=list)
    hazard_information: Optional[str] = None
    
    reported_at: str = Field(default_factory=utc_now_iso)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None
    
    assigned_resources: List[str] = Field(default_factory=list)
    resolution_details: Optional[str] = None
    resolved_at: Optional[str] = None

    @field_validator("latitude")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError("Latitude must be between -90 and 90")
        return round(v, 6)

    @field_validator("longitude")
    @classmethod
    def validate_lon(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError("Longitude must be between -180 and 180")
        return round(v, 6)

class DuplicateCandidate(BaseModel):
    existing_incident_id: str
    existing_incident_type: str
    existing_status: str
    distance_meters: float
    time_difference_minutes: float
    description_similarity: float
    confidence_score: float
    reasons: List[str]
