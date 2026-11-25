"""
SQLAlchemy and PostGIS Models for ATLAS.
Supports PostgreSQL (with Geometry Point columns and PostGIS spatial indexes)
and SQLite compatibility (for local testing environments without SpatiaLite/PostGIS DLLs).
"""
import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column, String, Integer, Float, Text, Boolean, DateTime, ForeignKey, Index, text
)
from sqlalchemy.orm import declarative_base, relationship

from app.config import settings

# PostGIS Geometry is enabled when running on PostgreSQL with PostGIS
IS_POSTGRES = str(settings.DATABASE_URL).startswith("postgresql")

try:
    from geoalchemy2 import Geometry
    HAS_GEOALCHEMY = True
except ImportError:
    HAS_GEOALCHEMY = False

Base = declarative_base()

# Helper to conditionally define PostGIS geometry column on PostgreSQL
def create_geom_column():
    if HAS_GEOALCHEMY and IS_POSTGRES and settings.ENABLE_POSTGIS:
        return Column(Geometry(geometry_type='POINT', srid=4326), nullable=True)
    return None

class IncidentModel(Base):
    __tablename__ = "incidents"

    id = Column(String(50), primary_key=True, index=True)
    type = Column(String(50), nullable=False, index=True)
    category = Column(String(50), nullable=False)
    severity = Column(Integer, nullable=False)
    urgency = Column(Integer, nullable=False)
    confidence = Column(Float, nullable=False)
    priority_score = Column(Float, nullable=False, index=True)
    priority_level = Column(String(20), nullable=False)
    status = Column(String(30), nullable=False, index=True)
    verification_status = Column(String(30), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_description = Column(Text, nullable=True)
    source = Column(String(50), nullable=False)
    source_reference = Column(String(100), nullable=True)
    people_affected = Column(Integer, default=1, nullable=False)
    casualties = Column(Integer, default=0, nullable=False)
    requiring_rescue = Column(Integer, default=0, nullable=False)
    requiring_medical = Column(Integer, default=0, nullable=False)
    description = Column(Text, nullable=False)
    required_capabilities = Column(Text, default="[]", nullable=False)  # JSON text
    hazard_information = Column(Text, nullable=True)
    reported_at = Column(String(50), nullable=False)
    created_at = Column(String(50), nullable=False, index=True)
    updated_at = Column(String(50), nullable=False)
    verified_at = Column(String(50), nullable=True)
    verified_by = Column(String(50), nullable=True)
    assigned_resources = Column(Text, default="[]", nullable=False)  # JSON text
    resolution_details = Column(Text, nullable=True)
    resolved_at = Column(String(50), nullable=True)

    geom = create_geom_column()

    reports = relationship("IncidentReportModel", back_populates="incident", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_incidents_lat_lon", "latitude", "longitude"),
    )

class IncidentReportModel(Base):
    __tablename__ = "incident_reports"

    id = Column(String(50), primary_key=True, index=True)
    incident_id = Column(String(50), ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True, index=True)
    source = Column(String(50), nullable=False)
    reporter_reference = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_description = Column(Text, nullable=True)
    emergency_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    people_affected = Column(Integer, default=1, nullable=False)
    casualties = Column(Integer, default=0, nullable=False)
    requires_rescue = Column(Boolean, default=False, nullable=False)
    requires_medical = Column(Boolean, default=False, nullable=False)
    evidence_references = Column(Text, default="[]", nullable=False)  # JSON text
    verification_status = Column(String(30), nullable=False)
    created_at = Column(String(50), nullable=False, index=True)

    geom = create_geom_column()

    incident = relationship("IncidentModel", back_populates="reports")

class IncidentEventModel(Base):
    __tablename__ = "incident_events"

    id = Column(String(50), primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(50), nullable=False, index=True)
    actor_id = Column(String(50), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=False)
    previous_state = Column(String(50), nullable=True)
    new_state = Column(String(50), nullable=True)
    reason = Column(Text, nullable=True)
    context = Column(Text, default="{}", nullable=False)  # JSON text
    created_at = Column(String(50), nullable=False, index=True)

class ResourceModel(Base):
    __tablename__ = "resources"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capabilities = Column(Text, default="[]", nullable=False)  # JSON text
    status = Column(String(30), default="Available", nullable=False, index=True)
    capacity = Column(Integer, default=4, nullable=False)
    current_assignment_id = Column(String(50), nullable=True)
    updated_at = Column(String(50), nullable=False)

    geom = create_geom_column()

class HospitalModel(Base):
    __tablename__ = "hospitals"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    total_beds = Column(Integer, nullable=False)
    available_beds = Column(Integer, nullable=False)
    icu_capacity = Column(Integer, nullable=False)
    emergency_capacity = Column(Integer, nullable=False)
    available_medical_personnel = Column(Integer, nullable=False)
    operational_status = Column(String(50), default="Operational", nullable=False)
    updated_at = Column(String(50), nullable=False)

    geom = create_geom_column()

class AssignmentModel(Base):
    __tablename__ = "assignments"

    id = Column(String(50), primary_key=True, index=True)
    incident_id = Column(String(50), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_id = Column(String(50), ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True)
    route_geometry = Column(Text, nullable=True)  # JSON coordinates array
    route_distance_km = Column(Float, default=0.0, nullable=False)
    assignment_status = Column(String(50), default="Dispatched", nullable=False, index=True)
    explanation = Column(Text, nullable=False)
    assigned_at = Column(String(50), nullable=False)
    updated_at = Column(String(50), nullable=False)

class MedicalReferralModel(Base):
    __tablename__ = "medical_referrals"

    id = Column(String(50), primary_key=True, index=True)
    incident_id = Column(String(50), nullable=False, index=True)
    hospital_id = Column(String(50), ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_id = Column(String(50), nullable=False)
    estimated_arrival_minutes = Column(Integer, default=15, nullable=False)
    estimated_patient_count = Column(Integer, default=1, nullable=False)
    patient_condition = Column(Text, nullable=False)
    severity = Column(String(30), default="Urgent", nullable=False)
    treatment_required = Column(Text, nullable=True)
    status = Column(String(30), default="En Route", nullable=False, index=True)
    created_at = Column(String(50), nullable=False)
    updated_at = Column(String(50), nullable=False)

class ShelterModel(Base):
    __tablename__ = "shelters"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(Text, nullable=False)
    capacity = Column(Integer, default=100, nullable=False)
    current_occupancy = Column(Integer, default=0, nullable=False)
    operational_status = Column(String(30), default="Open", nullable=False, index=True)
    supplies_status = Column(String(30), default="Adequate", nullable=False)
    updated_at = Column(String(50), nullable=False)

    geom = create_geom_column()

class RoadBlockageModel(Base):
    __tablename__ = "road_blockages"

    id = Column(String(50), primary_key=True, index=True)
    road_id = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(30), default="Active", nullable=False, index=True)
    avoid_radius_km = Column(Float, default=0.35, nullable=False)
    created_at = Column(String(50), nullable=False)

    geom = create_geom_column()

class FieldAlertModel(Base):
    __tablename__ = "field_alerts"

    id = Column(String(50), primary_key=True, index=True)
    rescuer_id = Column(String(50), nullable=False, index=True)
    rescuer_name = Column(String(100), nullable=False)
    active_assignment_id = Column(String(50), nullable=True)
    original_incident_id = Column(String(50), nullable=True)
    new_incident_id = Column(String(50), nullable=True, index=True)
    emergency_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_description = Column(Text, nullable=True)
    people_affected = Column(Integer, default=1, nullable=False)
    casualties = Column(Integer, default=0, nullable=False)
    requires_rescue = Column(Boolean, default=False, nullable=False)
    requires_medical = Column(Boolean, default=False, nullable=False)
    hazard_info = Column(Text, nullable=True)
    urgency = Column(String(30), default="High", nullable=False)
    status = Column(String(30), default="Reported", nullable=False, index=True)  # Reported, Acknowledged, Combined, Separate Unit Assigned, Dismissed
    command_decision = Column(Text, nullable=True)
    decision_reason = Column(Text, nullable=True)
    created_at = Column(String(50), nullable=False, index=True)
    updated_at = Column(String(50), nullable=False)

    geom = create_geom_column()

class MissionMessageModel(Base):
    __tablename__ = "mission_messages"

    id = Column(String(50), primary_key=True, index=True)
    mission_id = Column(String(50), nullable=False, index=True)  # Links to assignment_id or incident_id
    field_alert_id = Column(String(50), nullable=True, index=True)
    sender_id = Column(String(50), nullable=False)
    sender_name = Column(String(100), nullable=False)
    sender_role = Column(String(30), nullable=False)  # rescuer, admin, system
    message_type = Column(String(30), default="chat", nullable=False)  # chat, instruction, alert, acknowledgment
    content = Column(Text, nullable=False)
    priority = Column(String(20), default="Normal", nullable=False)  # Normal, Priority, Urgent
    acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_at = Column(String(50), nullable=True)
    created_at = Column(String(50), nullable=False, index=True)

