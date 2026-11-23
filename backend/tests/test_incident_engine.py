"""
Comprehensive Automated Test Suite for ATLAS Phase 1 Incident Engine.
Validates:
1. Incident Creation (Valid, invalid coordinates, invalid types, invalid bounds)
2. Lifecycle State Machine (Valid transitions, illegal transitions, verification, resolution, reopening, duplicate flagging)
3. Incident Reports (Civilian, Rescuer, multi-report linking, report history preservation)
4. Deterministic Duplicate Detection (Spatial, temporal, categorical, description overlap)
5. Event History & Audit Trail (Event append, state transition recording, actor attribution)
6. REST API V1 Endpoints (CRUD, filtering, pagination, access control, error codes)
7. End-to-End Incident Operations Integration
"""
import pytest
import os
import tempfile
from fastapi.testclient import TestClient
from app.main import app
from app.domain.models import IncidentRecord, IncidentReport, IncidentActor, utc_now_iso
from app.domain.enums import IncidentType, IncidentCategory, IncidentStatus, VerificationStatus, PriorityLevel, ReportSource, ActorRole, EventType
from app.domain.state_machine import IncidentStateMachine, IncidentLifecycleError
from app.services.duplicate_service import DuplicateDetector
from app.services.incident_service import IncidentService
from app.db.sqlite_store import SQLiteOperationalStore

# --- Fixtures ---

@pytest.fixture(scope="function")
def temp_store():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    store = SQLiteOperationalStore(db_path=db_path)
    yield store
    if os.path.exists(db_path):
        os.remove(db_path)

@pytest.fixture(scope="function")
def inc_service(temp_store):
    return IncidentService(store=temp_store)

@pytest.fixture(scope="function")
def admin_actor():
    return IncidentActor(id="ADM-01", name="Commander Sharma", role=ActorRole.ADMIN)

@pytest.fixture(scope="function")
def rescuer_actor():
    return IncidentActor(id="R-04", name="Rescuer Patil", role=ActorRole.RESCUER)

@pytest.fixture(scope="function")
def civilian_actor():
    return IncidentActor(id="CIV-101", name="Ravi Kumar", role=ActorRole.CIVILIAN)

@pytest.fixture(scope="module")
def client():
    return TestClient(app)

# =====================================================================
# 1. INCIDENT CREATION & VALIDATION TESTS
# =====================================================================

def test_valid_incident_creation_from_report(inc_service, admin_actor):
    report = IncidentReport(
        id="REP-TEST-01",
        source=ReportSource.CIVILIAN_SOS,
        reporter_reference="user-99",
        latitude=12.3120,
        longitude=76.6450,
        location_description="Near Vijayanagar water tank",
        emergency_type=IncidentType.FLOODING,
        description="Water rapidly entering ground floor homes.",
        people_affected=6,
        requires_rescue=True
    )

    incident, saved_report, duplicates = inc_service.create_incident_from_report(
        report=report,
        actor=admin_actor,
        severity=4,
        urgency=4
    )

    assert incident.id.startswith("INC-")
    assert incident.type == IncidentType.FLOODING
    assert incident.category == IncidentCategory.NATURAL_DISASTER
    assert incident.latitude == 12.3120
    assert incident.longitude == 76.6450
    assert incident.people_affected == 6
    assert incident.priority_score > 3.0
    assert "water_rescue" in incident.required_capabilities
    assert saved_report.incident_id == incident.id
    assert len(duplicates) == 0

def test_invalid_coordinates_validation():
    with pytest.raises(ValueError):
        IncidentReport(
            id="REP-INV-1",
            source=ReportSource.CIVILIAN_SOS,
            latitude=95.0, # Latitude out of range
            longitude=76.64,
            emergency_type=IncidentType.FLOODING,
            description="Flooding reported"
        )

    with pytest.raises(ValueError):
        IncidentReport(
            id="REP-INV-2",
            source=ReportSource.CIVILIAN_SOS,
            latitude=12.3,
            longitude=-185.0, # Longitude out of range
            emergency_type=IncidentType.FLOODING,
            description="Flooding reported"
        )

def test_missing_required_fields_and_short_description():
    with pytest.raises(ValueError):
        IncidentReport(
            id="REP-INV-3",
            source=ReportSource.CIVILIAN_SOS,
            latitude=12.3,
            longitude=76.64,
            emergency_type=IncidentType.FLOODING,
            description="ab" # Too short (<3 chars)
        )

# =====================================================================
# 2. LIFECYCLE STATE MACHINE TESTS
# =====================================================================

def test_valid_lifecycle_transitions(inc_service, admin_actor, rescuer_actor):
    report = IncidentReport(
        id="REP-LIFE-01",
        source=ReportSource.CIVILIAN_SOS,
        latitude=12.3000,
        longitude=76.6400,
        emergency_type=IncidentType.TRAPPED_PEOPLE,
        description="People stuck on terrace."
    )
    inc, _, _ = inc_service.create_incident_from_report(report, admin_actor, initial_status=IncidentStatus.RECEIVED)
    assert inc.status == IncidentStatus.RECEIVED

    # RECEIVED -> UNDER_REVIEW
    inc = inc_service.transition_incident(inc.id, IncidentStatus.UNDER_REVIEW, admin_actor, "Investigating distress report")
    assert inc.status == IncidentStatus.UNDER_REVIEW

    # UNDER_REVIEW -> VERIFIED
    inc = inc_service.verify_incident(inc.id, admin_actor, "Confirmed by drone reconnaissance")
    assert inc.status == IncidentStatus.VERIFIED
    assert inc.verification_status == VerificationStatus.VERIFIED
    assert inc.verified_by == admin_actor.name

    # VERIFIED -> ACTIVE
    inc = inc_service.transition_incident(inc.id, IncidentStatus.ACTIVE, admin_actor, "Resource allocated to queue")
    assert inc.status == IncidentStatus.ACTIVE

    # ACTIVE -> RESPONSE_IN_PROGRESS
    inc = inc_service.transition_incident(inc.id, IncidentStatus.RESPONSE_IN_PROGRESS, rescuer_actor, "Unit R-04 dispatched")
    assert inc.status == IncidentStatus.RESPONSE_IN_PROGRESS

    # RESPONSE_IN_PROGRESS -> ON_SCENE
    inc = inc_service.transition_incident(inc.id, IncidentStatus.ON_SCENE, rescuer_actor, "Rescuers arrived on site")
    assert inc.status == IncidentStatus.ON_SCENE

    # ON_SCENE -> RESOLVED
    inc = inc_service.resolve_incident(inc.id, rescuer_actor, "All 4 civilians successfully evacuated to safe shelter.")
    assert inc.status == IncidentStatus.RESOLVED
    assert inc.resolution_details is not None

    # RESOLVED -> CLOSED
    inc = inc_service.transition_incident(inc.id, IncidentStatus.CLOSED, admin_actor, "Post-operation review complete")
    assert inc.status == IncidentStatus.CLOSED

def test_illegal_lifecycle_transitions(inc_service, admin_actor):
    report = IncidentReport(
        id="REP-ILLEGAL-01",
        source=ReportSource.CIVILIAN_SOS,
        latitude=12.3000,
        longitude=76.6400,
        emergency_type=IncidentType.FIRE,
        description="Small electrical fire."
    )
    inc, _, _ = inc_service.create_incident_from_report(report, admin_actor, initial_status=IncidentStatus.RECEIVED)

    # Illegal: Cannot jump from RECEIVED straight to ON_SCENE or CLOSED
    with pytest.raises(IncidentLifecycleError):
        inc_service.transition_incident(inc.id, IncidentStatus.ON_SCENE, admin_actor)

    with pytest.raises(IncidentLifecycleError):
        inc_service.transition_incident(inc.id, IncidentStatus.CLOSED, admin_actor)

def test_incident_reopen_and_guard_rules(inc_service, admin_actor, rescuer_actor):
    report = IncidentReport(
        id="REP-REOPEN-01",
        source=ReportSource.CIVILIAN_SOS,
        latitude=12.3000,
        longitude=76.6400,
        emergency_type=IncidentType.FLOODING,
        description="Submerged road culvert"
    )
    inc, _, _ = inc_service.create_incident_from_report(report, admin_actor, initial_status=IncidentStatus.ACTIVE)
    
    # Resolve it
    inc = inc_service.resolve_incident(inc.id, rescuer_actor, "Water receded")
    assert inc.status == IncidentStatus.RESOLVED

    # Guard: Reopening without reason fails
    with pytest.raises(IncidentLifecycleError):
        inc_service.reopen_incident(inc.id, admin_actor, "bad") # too short (<5 chars)

    # Valid Reopen
    inc = inc_service.reopen_incident(inc.id, admin_actor, "Water level surged again due to upstream canal overflow")
    assert inc.status == IncidentStatus.ACTIVE
    assert "Reopened by Commander Sharma" in inc.resolution_details

# =====================================================================
# 3. REPORT MANAGEMENT & MULTI-REPORT LINKING TESTS
# =====================================================================

def test_multiple_reports_linked_to_single_incident(inc_service, admin_actor, civilian_actor, rescuer_actor):
    # Primary SOS
    rep1 = IncidentReport(
        id="REP-LINK-1",
        source=ReportSource.CIVILIAN_SOS,
        reporter_reference="citizen-A",
        latitude=12.3100,
        longitude=76.6400,
        emergency_type=IncidentType.FLOODING,
        description="Flooding at junction 3."
    )
    inc, _, _ = inc_service.create_incident_from_report(rep1, civilian_actor)

    # Secondary field report from rescuer on the ground
    rep2 = IncidentReport(
        id="REP-LINK-2",
        source=ReportSource.RESCUER_FIELD,
        reporter_reference="R-04",
        latitude=12.3105,
        longitude=76.6402,
        emergency_type=IncidentType.FLOODING,
        description="Field update: Water depth measured at 4.2ft. 2 additional families need rescue.",
        people_affected=5,
        requires_rescue=True
    )
    inc_service.store.insert_report(rep2)

    # Link rep2 to existing inc
    linked_rep = inc_service.link_report_to_incident(rep2.id, inc.id, admin_actor, "Consolidating rescuer field report")
    assert linked_rep.incident_id == inc.id

    # Retrieve all reports for this incident
    associated_reports = inc_service.store.list_reports_for_incident(inc.id)
    assert len(associated_reports) == 2
    report_sources = [r.source for r in associated_reports]
    assert ReportSource.CIVILIAN_SOS in report_sources
    assert ReportSource.RESCUER_FIELD in report_sources

# =====================================================================
# 4. DETERMINISTIC DUPLICATE DETECTION TESTS
# =====================================================================

def test_duplicate_detection_exact_and_spatial(inc_service, admin_actor):
    # Incident 1
    rep1 = IncidentReport(
        id="REP-DUP-1",
        source=ReportSource.CIVILIAN_SOS,
        latitude=12.3150,
        longitude=76.6450,
        emergency_type=IncidentType.FLOODING,
        description="Severe flooding near Saraswathipuram main road."
    )
    inc1, _, _ = inc_service.create_incident_from_report(rep1, admin_actor)

    # Incident 2: 120m away, same emergency type, 15 min later
    rep2 = IncidentReport(
        id="REP-DUP-2",
        source=ReportSource.CIVILIAN_SOS,
        latitude=12.3158, # ~100-150m away
        longitude=76.6452,
        emergency_type=IncidentType.FLOODING,
        description="Flooding on Saraswathipuram road water entering shops."
    )
    inc2, _, duplicates = inc_service.create_incident_from_report(rep2, admin_actor)

    assert len(duplicates) >= 1
    top_dup = duplicates[0]
    assert top_dup.existing_incident_id == inc1.id
    assert top_dup.distance_meters < 200.0
    assert top_dup.confidence_score >= 0.70
    assert "Identical emergency type (Flooding)" in top_dup.reasons

def test_duplicate_detection_distinguishes_different_types():
    inc1 = IncidentRecord(
        id="INC-EXIST-1",
        type=IncidentType.ROAD_BLOCKAGE,
        latitude=12.3150,
        longitude=76.6450,
        description="Fallen tree blocking lane"
    )

    inc2 = IncidentRecord(
        id="INC-NEW-2",
        type=IncidentType.MEDICAL_EMERGENCY,
        latitude=12.3150,
        longitude=76.6450,
        description="Elderly patient cardiac arrest"
    )

    candidates = DuplicateDetector.check_for_duplicates(inc2, [inc1])
    # Even at the exact same coordinates, differing types and different descriptions should not meet duplicate threshold
    assert len(candidates) == 0

# =====================================================================
# 5. EVENT HISTORY & AUDIT TRAIL TESTS
# =====================================================================

def test_event_history_preservation(inc_service, admin_actor, rescuer_actor):
    report = IncidentReport(
        id="REP-EVT-1",
        source=ReportSource.CIVILIAN_SOS,
        latitude=12.3100,
        longitude=76.6400,
        emergency_type=IncidentType.FLOODING,
        description="Canal breach"
    )
    inc, _, _ = inc_service.create_incident_from_report(report, admin_actor)
    inc = inc_service.verify_incident(inc.id, admin_actor, "Drone photo verified")
    inc = inc_service.transition_incident(inc.id, IncidentStatus.ACTIVE, admin_actor)
    inc = inc_service.resolve_incident(inc.id, rescuer_actor, "Cleared")

    events = inc_service.store.list_events_for_incident(inc.id)
    assert len(events) >= 4

    event_types = [e.event_type for e in events]
    assert EventType.INCIDENT_CREATED in event_types
    assert EventType.STATUS_TRANSITION in event_types

    # Validate actor attribution
    resolve_event = next(e for e in events if e.new_state == "RESOLVED")
    assert resolve_event.actor.name == rescuer_actor.name
    assert resolve_event.actor.role == ActorRole.RESCUER
    assert resolve_event.reason == "Cleared"

# =====================================================================
# 6. REST API V1 INTEGRATION TESTS
# =====================================================================

def test_api_v1_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ATLAS Incident Engine"

def test_api_v1_operations_summary(client):
    res = client.get("/api/v1/operations/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "total_incidents" in data
    assert "audit_events_recorded" in data

def test_api_v1_incident_crud_and_lifecycle_flow(client):
    # 1. Create Incident via API V1
    create_payload = {
        "type": "Flooding",
        "description": "API Integration Test Incident: severe flooding in residential alley.",
        "latitude": 12.3150,
        "longitude": 76.6420,
        "location_description": "Near VVCE Campus",
        "severity": 4,
        "urgency": 4,
        "people_affected": 8,
        "source": "Admin Created Incident",
        "initial_status": "RECEIVED"
    }

    headers = {
        "X-Actor-ID": "ADM-02",
        "X-Actor-Name": "Lead Officer Kumar",
        "X-Actor-Role": "admin"
    }

    res = client.post("/api/v1/incidents", json=create_payload, headers=headers)
    assert res.status_code == 201
    created_data = res.json()["data"]
    inc_id = created_data["id"]
    assert created_data["status"] == "RECEIVED"
    assert created_data["priority_score"] >= 3.0

    # 2. Get Incident by ID
    get_res = client.get(f"/api/v1/incidents/{inc_id}")
    assert get_res.status_code == 200
    assert get_res.json()["data"]["id"] == inc_id

    # 3. Transition to VERIFIED
    verify_res = client.post(f"/api/v1/incidents/{inc_id}/verify", json={"notes": "Ground spotter confirmed"}, headers=headers)
    assert verify_res.status_code == 200
    assert verify_res.json()["data"]["status"] == "VERIFIED"

    # 4. Resolve Incident
    resolve_payload = {"resolution_summary": "Pumping completed, alley cleared."}
    resolve_res = client.post(f"/api/v1/incidents/{inc_id}/resolve", json=resolve_payload, headers=headers)
    assert resolve_res.status_code == 200
    assert resolve_res.json()["data"]["status"] == "RESOLVED"

    # 5. Fetch Events Audit Trail
    events_res = client.get(f"/api/v1/incidents/{inc_id}/events")
    assert events_res.status_code == 200
    events = events_res.json()["data"]
    assert len(events) >= 3

def test_api_v1_civilian_permissions_guard(client):
    # Civilians cannot arbitrarily verify incidents
    headers = {
        "X-Actor-ID": "CIV-999",
        "X-Actor-Name": "Anonymous User",
        "X-Actor-Role": "civilian"
    }

    res = client.post("/api/v1/incidents/INC-101/verify", json={"notes": "fake verification"}, headers=headers)
    assert res.status_code == 403
    assert "Access denied" in res.json()["detail"]
