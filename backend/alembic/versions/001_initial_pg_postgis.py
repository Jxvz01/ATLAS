"""Initial PostgreSQL schema with PostGIS support for ATLAS

Revision ID: 001_initial_pg_postgis
Revises: 
Create Date: 2026-11-25 20:35:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

try:
    from geoalchemy2 import Geometry
except ImportError:
    Geometry = None

# revision identifiers, used by Alembic.
revision = '001_initial_pg_postgis'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Enable PostGIS Extension if on PostgreSQL
    conn = op.get_bind()
    is_pg = conn.dialect.name == 'postgresql'
    
    if is_pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 2. Incidents Table
    op.create_table(
        'incidents',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.Integer(), nullable=False),
        sa.Column('urgency', sa.Integer(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('priority_score', sa.Float(), nullable=False),
        sa.Column('priority_level', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('verification_status', sa.String(length=30), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('location_description', sa.Text(), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('source_reference', sa.String(length=100), nullable=True),
        sa.Column('people_affected', sa.Integer(), server_default='1', nullable=False),
        sa.Column('casualties', sa.Integer(), server_default='0', nullable=False),
        sa.Column('requiring_rescue', sa.Integer(), server_default='0', nullable=False),
        sa.Column('requiring_medical', sa.Integer(), server_default='0', nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('required_capabilities', sa.Text(), server_default='[]', nullable=False),
        sa.Column('hazard_information', sa.Text(), nullable=True),
        sa.Column('reported_at', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.String(length=50), nullable=False),
        sa.Column('updated_at', sa.String(length=50), nullable=False),
        sa.Column('verified_at', sa.String(length=50), nullable=True),
        sa.Column('verified_by', sa.String(length=50), nullable=True),
        sa.Column('assigned_resources', sa.Text(), server_default='[]', nullable=False),
        sa.Column('resolution_details', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.String(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_incidents_status', 'incidents', ['status'])
    op.create_index('idx_incidents_type', 'incidents', ['type'])
    op.create_index('idx_incidents_priority', 'incidents', ['priority_score'])
    op.create_index('idx_incidents_created_at', 'incidents', ['created_at'])

    # 3. Incident Reports Table
    op.create_table(
        'incident_reports',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('incident_id', sa.String(length=50), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('reporter_reference', sa.String(length=100), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('location_description', sa.Text(), nullable=True),
        sa.Column('emergency_type', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('people_affected', sa.Integer(), server_default='1', nullable=False),
        sa.Column('casualties', sa.Integer(), server_default='0', nullable=False),
        sa.Column('requires_rescue', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('requires_medical', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('evidence_references', sa.Text(), server_default='[]', nullable=False),
        sa.Column('verification_status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_reports_incident_id', 'incident_reports', ['incident_id'])

    # 4. Incident Events Audit Trail Table
    op.create_table(
        'incident_events',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.String(length=50), nullable=False),
        sa.Column('actor_id', sa.String(length=50), nullable=False),
        sa.Column('actor_name', sa.String(length=100), nullable=False),
        sa.Column('actor_role', sa.String(length=50), nullable=False),
        sa.Column('previous_state', sa.String(length=50), nullable=True),
        sa.Column('new_state', sa.String(length=50), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('context', sa.Text(), server_default='{}', nullable=False),
        sa.Column('created_at', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_events_entity_id', 'incident_events', ['entity_id'])
    op.create_index('idx_events_type', 'incident_events', ['event_type'])

    # 5. Resources Table
    op.create_table(
        'resources',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('capabilities', sa.Text(), server_default='[]', nullable=False),
        sa.Column('status', sa.String(length=30), server_default='Available', nullable=False),
        sa.Column('capacity', sa.Integer(), server_default='4', nullable=False),
        sa.Column('current_assignment_id', sa.String(length=50), nullable=True),
        sa.Column('updated_at', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_resources_status', 'resources', ['status'])

    # 6. Hospitals Table
    op.create_table(
        'hospitals',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('total_beds', sa.Integer(), nullable=False),
        sa.Column('available_beds', sa.Integer(), nullable=False),
        sa.Column('icu_capacity', sa.Integer(), nullable=False),
        sa.Column('emergency_capacity', sa.Integer(), nullable=False),
        sa.Column('available_medical_personnel', sa.Integer(), nullable=False),
        sa.Column('operational_status', sa.String(length=50), server_default='Operational', nullable=False),
        sa.Column('updated_at', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 7. Assignments Table
    op.create_table(
        'assignments',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('incident_id', sa.String(length=50), nullable=False),
        sa.Column('resource_id', sa.String(length=50), nullable=False),
        sa.Column('route_geometry', sa.Text(), nullable=True),
        sa.Column('route_distance_km', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('assignment_status', sa.String(length=50), server_default='Dispatched', nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('assigned_at', sa.String(length=50), nullable=False),
        sa.Column('updated_at', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resource_id'], ['resources.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_assignments_incident', 'assignments', ['incident_id'])
    op.create_index('idx_assignments_resource', 'assignments', ['resource_id'])

    # 8. Medical Referrals Table
    op.create_table(
        'medical_referrals',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('incident_id', sa.String(length=50), nullable=False),
        sa.Column('hospital_id', sa.String(length=50), nullable=False),
        sa.Column('resource_id', sa.String(length=50), nullable=False),
        sa.Column('estimated_arrival_minutes', sa.Integer(), server_default='15', nullable=False),
        sa.Column('estimated_patient_count', sa.Integer(), server_default='1', nullable=False),
        sa.Column('patient_condition', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(length=30), server_default='Urgent', nullable=False),
        sa.Column('treatment_required', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=30), server_default='En Route', nullable=False),
        sa.Column('created_at', sa.String(length=50), nullable=False),
        sa.Column('updated_at', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_referrals_hospital', 'medical_referrals', ['hospital_id'])

    # 9. Shelters Table
    op.create_table(
        'shelters',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('address', sa.Text(), nullable=False),
        sa.Column('capacity', sa.Integer(), server_default='100', nullable=False),
        sa.Column('current_occupancy', sa.Integer(), server_default='0', nullable=False),
        sa.Column('operational_status', sa.String(length=30), server_default='Open', nullable=False),
        sa.Column('supplies_status', sa.String(length=30), server_default='Adequate', nullable=False),
        sa.Column('updated_at', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 10. PostGIS Spatial Column & GiST index additions on PostgreSQL
    if is_pg:
        for tbl in ['incidents', 'resources', 'hospitals', 'shelters']:
            op.execute(f"ALTER TABLE {tbl} ADD COLUMN geom geometry(Point, 4326);")
            op.execute(f"CREATE INDEX idx_{tbl}_geom ON {tbl} USING GIST (geom);")

def downgrade() -> None:
    for tbl in ['medical_referrals', 'assignments', 'shelters', 'hospitals', 'resources', 'incident_events', 'incident_reports', 'incidents']:
        op.drop_table(tbl)
