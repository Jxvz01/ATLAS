import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import get_db_session
from app.db.models_sql import (
    IncidentModel, AssignmentModel, IncidentReportModel,
    FieldAlertModel, MissionMessageModel, HospitalModel, MedicalReferralModel
)

client = TestClient(app)


def test_full_22_step_unified_postgresql_workflow():
    """
    Verifies all 4 portals share Supabase PostgreSQL as the single authoritative source of truth.
    Tests every write through FastAPI and verifies direct PostgreSQL row persistence.
    """
    tag = uuid.uuid4().hex[:6].upper()

    # STEP 1-3: Civilian SOS -> PostgreSQL -> Admin
    sos_res = client.post("/api/incidents", json={
        "type": "Trapped / Need Rescue",
        "description": f"UNIFIED-E2E-SOS-{tag}",
        "latitude": 12.3180,
        "longitude": 76.6430,
        "severity": 5,
        "urgency": 5,
        "affected_population": 4,
        "source": "Citizen SOS"
    })
    assert sos_res.status_code == 200, sos_res.text
    inc_id = sos_res.json()["id"]

    with get_db_session() as s:
        db_inc = s.query(IncidentModel).filter(IncidentModel.id == inc_id).first()
        assert db_inc is not None, "Civilian SOS not persisted in PostgreSQL"
        assert f"UNIFIED-E2E-SOS-{tag}" in db_inc.description

    scenario = client.get("/api/scenario/state").json()
    assert any(i["id"] == inc_id for i in scenario["incidents"])

    # STEP 4-6: Admin dispatches R-04 -> PostgreSQL -> Rescuer retrieves
    asg_res = client.post("/api/assignments", json={
        "incident_id": inc_id,
        "resource_id": "R-04",
        "explanation": f"Unified E2E Dispatch {tag}"
    })
    assert asg_res.status_code == 200, asg_res.text
    asg_id = asg_res.json()["id"]

    with get_db_session() as s:
        db_asg = s.query(AssignmentModel).filter(AssignmentModel.id == asg_id).first()
        assert db_asg is not None, "Assignment not persisted in PostgreSQL"
        assert db_asg.incident_id == inc_id
        assert db_asg.resource_id == "R-04"

    # STEP 7-8: Rescuer updates mission status -> PostgreSQL -> Admin retrieves
    upd_res = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "En Route"})
    assert upd_res.status_code == 200, upd_res.text
    with get_db_session() as s:
        db_asg = s.query(AssignmentModel).filter(AssignmentModel.id == asg_id).first()
        assert db_asg.assignment_status == "En Route"

    # STEP 9-10: Rescuer submits field report -> PostgreSQL
    fr_res = client.post("/api/field-reports", json={
        "incident_id": inc_id,
        "resource_id": "R-04",
        "casualties": 1,
        "assessment": f"E2E Field Report {tag}",
        "road_condition": "Flooded",
        "notes": "Need medical transport"
    })
    assert fr_res.status_code == 200, fr_res.text
    with get_db_session() as s:
        reports = s.query(IncidentReportModel).filter(IncidentReportModel.incident_id == inc_id).all()
        assert len(reports) >= 1

    # STEP 11-12: Rescuer reports nearby emergency -> PostgreSQL (both field_alert AND secondary incident)
    fa_res = client.post("/api/field-alerts", json={
        "rescuer_id": "R-04",
        "rescuer_name": "Boat Team Bravo",
        "active_assignment_id": asg_id,
        "original_incident_id": inc_id,
        "emergency_type": "Structural Collapse",
        "description": f"E2E Nearby Collapse {tag}",
        "latitude": 12.3195,
        "longitude": 76.6445,
        "people_affected": 2,
        "urgency": "Critical"
    })
    assert fa_res.status_code == 200, fa_res.text
    alert_id = fa_res.json()["alert"]["id"]
    sec_inc_id = fa_res.json()["incident"]["id"]

    with get_db_session() as s:
        assert s.query(FieldAlertModel).filter(FieldAlertModel.id == alert_id).first() is not None
        assert s.query(IncidentModel).filter(IncidentModel.id == sec_inc_id).first() is not None

    # STEP 13-15: Admin sends instruction -> Rescuer acknowledges -> PostgreSQL
    dec_res = client.patch(f"/api/field-alerts/{alert_id}/decision", json={
        "status": "Acknowledged",
        "command_decision": f"Hold position and assess {sec_inc_id}"
    })
    assert dec_res.status_code == 200, dec_res.text

    msgs = client.get(f"/api/missions/{asg_id}/messages").json()
    instr = next(m for m in msgs if m["sender_role"] == "admin")
    ack_res = client.post(f"/api/messages/{instr['id']}/acknowledge")
    assert ack_res.status_code == 200 and ack_res.json()["acknowledged"] is True

    with get_db_session() as s:
        db_msg = s.query(MissionMessageModel).filter(MissionMessageModel.id == instr["id"]).first()
        assert db_msg.acknowledged is True

    # STEP 16-17: Hospital updates capacity -> PostgreSQL -> Admin retrieves
    hosp_before = client.get("/api/hospitals").json()[0]
    new_beds = max(1, hosp_before["available_beds"] - 1)
    h_upd = client.patch(f"/api/hospitals/{hosp_before['id']}", json={"available_beds": new_beds})
    assert h_upd.status_code == 200
    with get_db_session() as s:
        db_hosp = s.query(HospitalModel).filter(HospitalModel.id == hosp_before["id"]).first()
        assert db_hosp.available_beds == new_beds

    # STEP 18-20: Create medical referral -> Hospital accepts -> PostgreSQL
    ref_res = client.post("/api/referrals", json={
        "incident_id": inc_id,
        "hospital_id": hosp_before["id"],
        "resource_id": "R-04",
        "estimated_arrival_minutes": 10,
        "estimated_patient_count": 1,
        "patient_condition": f"E2E Trauma {tag}",
        "severity": "Urgent"
    })
    assert ref_res.status_code == 200, ref_res.text
    ref_id = ref_res.json()["id"]

    acc_res = client.patch(f"/api/referrals/{ref_id}", json={"status": "Accepted"})
    assert acc_res.status_code == 200

    with get_db_session() as s:
        db_ref = s.query(MedicalReferralModel).filter(MedicalReferralModel.id == ref_id).first()
        assert db_ref is not None and db_ref.status == "Accepted"
        db_hosp_after = s.query(HospitalModel).filter(HospitalModel.id == hosp_before["id"]).first()
        assert db_hosp_after.available_beds == max(0, new_beds - 1)

    # STEP 21-22: Complete assignment & restore hospital beds so live DB stays clean
    comp_res = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "Completed"})
    assert comp_res.status_code == 200
    client.patch(f"/api/hospitals/{hosp_before['id']}", json={"available_beds": hosp_before["available_beds"]})
    with get_db_session() as s:
        db_asg_end = s.query(AssignmentModel).filter(AssignmentModel.id == asg_id).first()
        assert db_asg_end.assignment_status == "Completed"
