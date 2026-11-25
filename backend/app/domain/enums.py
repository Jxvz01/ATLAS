"""
Domain enumerations for the ATLAS Incident Engine.
Controlled domain values ensure consistency across all portals and persistence layers.
"""
from enum import Enum

class IncidentType(str, Enum):
    FLOODING = "Flooding"
    MEDICAL_EMERGENCY = "Medical Emergency"
    FIRE = "Fire"
    TRAPPED_PEOPLE = "Trapped / Need Rescue"
    ROAD_BLOCKAGE = "Road Blockage"
    STRUCTURAL_COLLAPSE = "Structural Collapse"
    HAZARDOUS_CONDITION = "Hazardous Condition"
    OTHER = "Other"

class IncidentCategory(str, Enum):
    NATURAL_DISASTER = "Natural Disaster"
    INFRASTRUCTURE = "Infrastructure"
    CASUALTY_AND_MEDICAL = "Casualty & Medical"
    HAZARD_CONTAINMENT = "Hazard Containment"
    PUBLIC_SAFETY = "Public Safety"

class IncidentStatus(str, Enum):
    RECEIVED = "RECEIVED"
    UNDER_REVIEW = "UNDER_REVIEW"
    VERIFIED = "VERIFIED"
    ACTIVE = "ACTIVE"
    RESPONSE_IN_PROGRESS = "RESPONSE_IN_PROGRESS"
    ON_SCENE = "ON_SCENE"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"
    REJECTED = "REJECTED"
    DUPLICATE = "DUPLICATE"
    CANCELLED = "CANCELLED"

class VerificationStatus(str, Enum):
    REPORTED = "REPORTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    VERIFIED = "VERIFIED"
    DISPUTED = "DISPUTED"
    UNVERIFIED = "UNVERIFIED"

class PriorityLevel(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class ReportSource(str, Enum):
    CIVILIAN_SOS = "Civilian SOS"
    CIVILIAN_REPORT = "Civilian Incident Report"
    RESCUER_FIELD = "Rescuer Field Report"
    ADMIN_COMMAND = "Admin Created Incident"
    OFFICIAL_ADVISORY = "Official Advisory"
    EXTERNAL_DATA = "External Data Source"
    SIMULATION = "Simulation"

class ActorRole(str, Enum):
    ADMIN = "admin"
    INCIDENT_COMMANDER = "incident_commander"
    HOSPITAL_OPERATOR = "hospital"
    RESCUER = "rescuer"
    CIVILIAN = "civilian"
    SYSTEM = "system"

class EventType(str, Enum):
    INCIDENT_RECEIVED = "INCIDENT_RECEIVED"
    INCIDENT_CREATED = "INCIDENT_CREATED"
    INCIDENT_VERIFIED = "INCIDENT_VERIFIED"
    INCIDENT_PRIORITY_UPDATED = "INCIDENT_PRIORITY_UPDATED"
    STATUS_TRANSITION = "STATUS_TRANSITION"
    REPORT_ASSOCIATED = "REPORT_ASSOCIATED"
    DUPLICATE_FLAGGED = "DUPLICATE_FLAGGED"
    INCIDENT_RESOLVED = "INCIDENT_RESOLVED"
    INCIDENT_CLOSED = "INCIDENT_CLOSED"
    INCIDENT_REOPENED = "INCIDENT_REOPENED"
    RESOURCE_ASSIGNED = "RESOURCE_ASSIGNED"
    FIELD_REPORT_SUBMITTED = "FIELD_REPORT_SUBMITTED"
    ROAD_HAZARD_REPORTED = "ROAD_HAZARD_REPORTED"
    HOSPITAL_REFERRAL_CREATED = "HOSPITAL_REFERRAL_CREATED"
    HOSPITAL_REFERRAL_ACCEPTED = "HOSPITAL_REFERRAL_ACCEPTED"
    HOSPITAL_REFERRAL_DECLINED = "HOSPITAL_REFERRAL_DECLINED"
    HOSPITAL_CAPACITY_UPDATED = "HOSPITAL_CAPACITY_UPDATED"
    SHELTER_CAPACITY_UPDATED = "SHELTER_CAPACITY_UPDATED"
