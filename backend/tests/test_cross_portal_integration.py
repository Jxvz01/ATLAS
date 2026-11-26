"""
Automated Cross-Portal Integration Tests for ATLAS Milestone 2.
Verifies complete operational workflow:
1. Civilian submits SOS -> Persisted in SQLite & memory StateStore.
2. Admin receives incident -> Retrieved via /api/scenario/state with identical ID, coords, type.
3. Admin assigns responder -> /api/assignments dispatches resource and links assignment.
4. Rescuer retrieves assignment -> Acknowledges -> En Route -> On Scene -> Completed.
5. Rescuer submits field report -> /api/field-reports persisted and reflected in event log.
6. Hospital capacity & referral acceptance -> Bed count decreases and event log recorded.
7. Verification of browser-independent shared persistence.
"""
import pytest
from fastapi.testclient import TestClient
import json

from app.main import app
from app.database import db
from app.db.postgres_store import db_store

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_operational_state():
    db.reset_scenario()
    yield

def test_cross_portal_civilian_to_admin_workflow():
    # 1. Civilian Submits SOS
    payload = {
        "type": "Flooding",
        "description": "Citizen SOS in Vijayanagar, Mysuru: Water entering house, need evacuation.",
        "latitude": 12.3180,
        "longitude": 76.6430,
        "affected_population": 3,
        "severity": 4,
        "urgency": 4,
        "source": "Citizen SOS"
    }
    resp = client.post("/api/incidents", json=payload)
    assert resp.status_code == 200
    created_incident = resp.json()
    incident_id = created_incident["id"]
    assert incident_id.startswith("INC-")
    assert created_incident["status"] == "Active"
    assert created_incident["affected_population"] == 3

    # 2. Verify Persistence in SQLite
    sqlite_inc = db_store.get_incident(incident_id)
    assert sqlite_inc is not None
    assert sqlite_inc.id == incident_id
    assert abs(sqlite_inc.latitude - 12.3180) < 0.0001
    assert abs(sqlite_inc.longitude - 76.6430) < 0.0001

    # 3. Verify Admin Portal Receives the Incident
    state_resp = client.get("/api/scenario/state")
    assert state_resp.status_code == 200
    state_data = state_resp.json()
    incidents_list = state_data["incidents"]
    
    # Matching incident must exist in admin's incident queue
    admin_match = next((i for i in incidents_list if i["id"] == incident_id), None)
    assert admin_match is not None, f"Incident {incident_id} not found in Admin scenario state"
    assert admin_match["type"] == "Flooding"
    assert admin_match["latitude"] == 12.3180
    assert admin_match["longitude"] == 76.6430
    assert admin_match["status"] == "Active"

def test_cross_portal_admin_to_rescuer_assignment_and_lifecycle():
    # 1. Create incident
    inc_resp = client.post("/api/incidents", json={
        "type": "Flooding",
        "description": "Family cut off by flash floods near canal.",
        "latitude": 12.3180,
        "longitude": 76.6430,
        "affected_population": 2
    })
    inc_id = inc_resp.json()["id"]

    # 2. Admin Assigns Resource R-04 (Boat Team)
    asg_resp = client.post("/api/assignments", json={
        "incident_id": inc_id,
        "resource_id": "R-04",
        "explanation": "Dispatching Civil Defense Boat Team Bravo"
    })
    assert asg_resp.status_code == 200
    asg = asg_resp.json()
    asg_id = asg["id"]
    assert asg["assignment_status"] == "Dispatched"

    # Verify Resource and Incident state are updated
    res_resp = client.get("/api/resources/R-04")
    assert res_resp.json()["status"] == "Assigned"
    assert res_resp.json()["current_assignment_id"] == asg_id

    # 3. Rescuer Acknowledges Mission
    ack_resp = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "Acknowledged"})
    assert ack_resp.status_code == 200
    assert ack_resp.json()["assignment_status"] == "Acknowledged"

    # 4. Rescuer Starts En Route
    en_route_resp = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "En Route"})
    assert en_route_resp.status_code == 200
    assert en_route_resp.json()["assignment_status"] == "En Route"
    assert db.resources["R-04"].status == "En route"
    assert db.incidents[inc_id].status == "In Progress"

    # 5. Rescuer Arrives On Scene
    on_scene_resp = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "On Scene"})
    assert on_scene_resp.status_code == 200
    assert db.resources["R-04"].status == "On scene"

    # 6. Rescuer Submits Field Report
    fld_resp = client.post("/api/field-reports", json={
        "incident_id": inc_id,
        "resource_id": "R-04",
        "casualties": 1,
        "assessment": "Access secure, flood level 3ft",
        "road_condition": "Passable by boat",
        "notes": "Medical assistance needed for elderly occupant"
    })
    assert fld_resp.status_code == 200
    assert fld_resp.json()["status"] == "received"

    # Verify report is preserved and logged in event history
    state_after = client.get("/api/scenario/state").json()
    recent_logs = [l["message"] for l in state_after["activity_logs"]]
    assert any("FIELD REPORT [Civil Defense Inflatable Boat Bravo]" in m for m in recent_logs)

    # 7. Rescuer Completes Mission
    comp_resp = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "Completed"})
    assert comp_resp.status_code == 200
    assert db.resources["R-04"].status == "Available"
    assert db.incidents[inc_id].status == "Resolved"

def test_cross_portal_hospital_capacity_and_referral():
    # 1. Hospital Operator Adjusts Capacity
    hosp_resp = client.patch("/api/hospitals/HOSP-01", json={"available_beds": 35})
    assert hosp_resp.status_code == 200
    assert hosp_resp.json()["available_beds"] == 35

    # 2. Verify Admin Command receives updated hospital beds
    state = client.get("/api/scenario/state").json()
    hosp = next(h for h in state["hospitals"] if h["id"] == "HOSP-01")
    assert hosp["available_beds"] == 35

    # 3. Activity Event Logged
    recent_logs = [l["message"] for l in state["activity_logs"]]
    assert any("HOSPITAL_CAPACITY_CHANGE" in l or "Beds Available=35" in l for l in recent_logs)

def test_cross_portal_medical_referral_and_shelter_sync():
    # 1. Create a medical referral from field to hospital
    ref_resp = client.post("/api/referrals", json={
        "incident_id": "INC-101",
        "hospital_id": "HOSP-01",
        "resource_id": "R-04",
        "estimated_arrival_minutes": 10,
        "estimated_patient_count": 2,
        "patient_condition": "Hypothermia and water inhalation",
        "severity": "Critical",
        "treatment_required": "Trauma stabilization & O2"
    })
    assert ref_resp.status_code == 200
    ref_data = ref_resp.json()
    ref_id = ref_data["id"]
    assert ref_data["status"] == "En Route"
    assert ref_data["estimated_patient_count"] == 2

    # 2. Verify referral is in SQLite
    sqlite_ref = db_store.get_referral(ref_id)
    assert sqlite_ref is not None
    assert sqlite_ref.hospital_id == "HOSP-01"
    assert sqlite_ref.patient_condition == "Hypothermia and water inhalation"

    # 3. Hospital Accepts Referral
    initial_beds = db.hospitals["HOSP-01"].available_beds
    update_ref_resp = client.patch(f"/api/referrals/{ref_id}", json={
        "status": "Accepted"
    })
    assert update_ref_resp.status_code == 200
    assert update_ref_resp.json()["status"] == "Accepted"

    # Available beds should decrease by patient count (2)
    assert db.hospitals["HOSP-01"].available_beds == initial_beds - 2

    # Verify SQLite updated
    updated_sqlite_ref = db_store.get_referral(ref_id)
    assert updated_sqlite_ref.status == "Accepted"

    # 4. Shelter capacity and occupancy updates
    shelters_resp = client.get("/api/shelters")
    assert shelters_resp.status_code == 200
    shelters = shelters_resp.json()
    assert len(shelters) >= 1
    sh_id = shelters[0]["id"]

    sh_update = client.patch(f"/api/shelters/{sh_id}", json={
        "current_occupancy": 150,
        "operational_status": "Open",
        "supplies_status": "Adequate"
    })
    assert sh_update.status_code == 200
    assert sh_update.json()["current_occupancy"] == 150

    # Verify scenario state includes shelters
    state_resp = client.get("/api/scenario/state").json()
    assert "shelters" in state_resp
    matching_sh = next(s for s in state_resp["shelters"] if s["id"] == sh_id)
    assert matching_sh["current_occupancy"] == 150
