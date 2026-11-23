"""
HTTP Request and Response DTO Schemas for Version 1 API.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from app.domain.enums import IncidentType, IncidentCategory, IncidentStatus, VerificationStatus, PriorityLevel, ReportSource, ActorRole
from app.domain.models import IncidentRecord, IncidentReport, IncidentEvent, DuplicateCandidate

# --- Requests ---
class CreateIncidentReportRequest(BaseModel):
    emergency_type: IncidentType
    description: str = Field(..., min_length=3, max_length=1000)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_description: Optional[str] = None
    people_affected: int = Field(default=1, ge=0)
    casualties: int = Field(default=0, ge=0)
    requires_rescue: bool = False
    requires_medical: bool = False
    source: ReportSource = ReportSource.CIVILIAN_SOS
    reporter_reference: Optional[str] = None

class CreateIncidentDirectRequest(BaseModel):
    type: IncidentType
    description: str = Field(..., min_length=3, max_length=2000)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_description: Optional[str] = None
    severity: int = Field(default=3, ge=1, le=5)
    urgency: int = Field(default=3, ge=1, le=5)
    people_affected: int = Field(default=1, ge=0)
    casualties: int = Field(default=0, ge=0)
    source: ReportSource = ReportSource.ADMIN_COMMAND
    initial_status: IncidentStatus = IncidentStatus.RECEIVED

class TransitionIncidentRequest(BaseModel):
    target_status: IncidentStatus
    reason: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

class VerifyIncidentRequest(BaseModel):
    notes: Optional[str] = None

class ResolveIncidentRequest(BaseModel):
    resolution_summary: str = Field(..., min_length=3, max_length=1000)

class ReopenIncidentRequest(BaseModel):
    reopen_reason: str = Field(..., min_length=5, max_length=1000)

class LinkReportRequest(BaseModel):
    target_incident_id: str
    reason: Optional[str] = None

class DuplicateCheckRequest(BaseModel):
    emergency_type: IncidentType
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    description: str = Field(..., min_length=3)
    time_window_hours: Optional[float] = 4.0
    distance_threshold_meters: Optional[float] = 750.0

# --- Responses ---
class IncidentResponse(BaseModel):
    success: bool = True
    data: IncidentRecord
    duplicate_candidates: Optional[List[DuplicateCandidate]] = None

class IncidentListResponse(BaseModel):
    success: bool = True
    total: int
    limit: int
    offset: int
    data: List[IncidentRecord]

class ReportResponse(BaseModel):
    success: bool = True
    data: IncidentReport

class ReportListResponse(BaseModel):
    success: bool = True
    data: List[IncidentReport]

class EventListResponse(BaseModel):
    success: bool = True
    data: List[IncidentEvent]

class DuplicateCheckResponse(BaseModel):
    success: bool = True
    candidates_count: int
    candidates: List[DuplicateCandidate]

class OperationalSummaryResponse(BaseModel):
    success: bool = True
    total_incidents: int
    active_incidents: int
    verified_incidents: int
    resolved_incidents: int
    critical_incidents: int
    total_reports_processed: int
    audit_events_recorded: int
    timestamp: str
