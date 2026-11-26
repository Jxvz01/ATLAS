import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_field_discovery_to_command_decision_and_acknowledgment():
    """
    End-to-end test against live Supabase PostgreSQL:
    1. Rescuer reports a nearby emergency during an active mission -> creates distinct new incident + field alert + initial message.
    2. Command retrieves field alerts, reviews, and issues a decision ("Combined" or "Separate Unit Assigned").
    3. Rescuer and Command exchange two-way mission messages.
    4. Rescuer acknowledges Command's instruction message -> acknowledgment persisted in Supabase.
    """
    unique_tag = uuid.uuid4().hex[:6].upper()
    mission_id = f"ASG-TEST-{unique_tag}"

    # 1. Rescuer reports nearby emergency
    alert_payload = {
        "rescuer_id": "R-04",
        "rescuer_name": "NDRF Boat Team Alpha",
        "active_assignment_id": mission_id,
        "original_incident_id": "INC-101",
        "emergency_type": "Trapped People",
        "description": f"3 civilians trapped on collapsed roof near Vijayanagar [{unique_tag}]",
        "latitude": 12.3145,
        "longitude": 76.6435,
        "location_description": "200m east of primary sector",
        "people_affected": 3,
        "casualties": 0,
        "requires_rescue": True,
        "requires_medical": False,
        "urgency": "Critical"
    }
    res = client.post("/api/field-alerts", json=alert_payload)
    assert res.status_code == 200, res.text
    data = res.json()
    alert = data["alert"]
    new_inc = data["incident"]

    assert alert["id"].startswith("ALT-")
    assert new_inc["id"].startswith("INC-FLD-")
    assert alert["original_incident_id"] == "INC-101"
    assert alert["new_incident_id"] == new_inc["id"]
    assert alert["status"] == "Reported"

    # Verify Command can list the field alert
    list_res = client.get("/api/field-alerts")
    assert list_res.status_code == 200
    alerts = list_res.json()
    assert any(a["id"] == alert["id"] for a in alerts)

    # 2. Command reviews & records decision (Combined Mission)
    decision_payload = {
        "status": "Combined",
        "command_decision": "Proceed to secondary emergency as next stop after securing perimeter.",
        "decision_reason": "Proximity within active unit corridor"
    }
    dec_res = client.patch(f"/api/field-alerts/{alert['id']}/decision", json=decision_payload)
    assert dec_res.status_code == 200, dec_res.text
    updated_alert = dec_res.json()
    assert updated_alert["status"] == "Combined"
    assert "Proceed to secondary emergency" in updated_alert["command_decision"]

    # 3. Two-way messaging between Rescuer and Command
    rescuer_msg_res = client.post(f"/api/missions/{mission_id}/messages", json={
        "sender_id": "R-04",
        "sender_name": "NDRF Boat Team Alpha",
        "sender_role": "rescuer",
        "message_type": "chat",
        "content": f"Perimeter secured at INC-101, moving toward {new_inc['id']}.",
        "priority": "Normal",
        "field_alert_id": alert["id"]
    })
    assert rescuer_msg_res.status_code == 200, rescuer_msg_res.text

    # Fetch mission thread -> should have initial alert, Command Instruction, and Rescuer chat
    thread_res = client.get(f"/api/missions/{mission_id}/messages")
    assert thread_res.status_code == 200
    messages = thread_res.json()
    assert len(messages) >= 3

    cmd_instructions = [m for m in messages if m["sender_role"] == "admin" and m["message_type"] == "instruction"]
    assert len(cmd_instructions) >= 1
    instruction_id = cmd_instructions[0]["id"]
    assert cmd_instructions[0]["acknowledged"] is False

    # 4. Rescuer acknowledges Command instruction
    ack_res = client.post(f"/api/messages/{instruction_id}/acknowledge")
    assert ack_res.status_code == 200, ack_res.text
    ack_data = ack_res.json()
    assert ack_data["acknowledged"] is True
    assert ack_data["acknowledged_at"] is not None

    # Verify persistence on re-fetch
    thread_after = client.get(f"/api/missions/{mission_id}/messages").json()
    acked_msg = next(m for m in thread_after if m["id"] == instruction_id)
    assert acked_msg["acknowledged"] is True


def test_offline_retry_idempotency_for_messages_and_field_alerts():
    """
    Verifies that retrying a mission message or field alert with the same client_id
    does NOT create duplicate messages or duplicate secondary incidents.
    """
    unique_tag = uuid.uuid4().hex[:6].upper()
    mission_id = f"ASG-IDEM-{unique_tag}"
    msg_client_id = f"MSG-Q-{unique_tag}"
    alert_client_id = f"ALT-Q-{unique_tag}"

    # 1. Send message twice with identical client_id
    msg_payload = {
        "sender_id": "R-04",
        "sender_name": "NDRF Boat Team Alpha",
        "sender_role": "rescuer",
        "message_type": "chat",
        "content": "Idempotency check message",
        "priority": "Normal",
        "client_id": msg_client_id
    }
    r1 = client.post(f"/api/missions/{mission_id}/messages", json=msg_payload)
    r2 = client.post(f"/api/missions/{mission_id}/messages", json=msg_payload)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] == msg_client_id
    assert r2.json()["id"] == msg_client_id

    msgs = [m for m in client.get(f"/api/missions/{mission_id}/messages").json() if m["id"] == msg_client_id]
    assert len(msgs) == 1

    # 2. Send field alert twice with identical client_id
    alert_payload = {
        "rescuer_id": "R-04",
        "rescuer_name": "NDRF Boat Team Alpha",
        "active_assignment_id": mission_id,
        "original_incident_id": "INC-101",
        "emergency_type": "Road Blockage",
        "description": f"Idempotent nearby hazard [{unique_tag}]",
        "latitude": 12.3150,
        "longitude": 76.6440,
        "urgency": "High",
        "client_id": alert_client_id
    }
    a1 = client.post("/api/field-alerts", json=alert_payload)
    a2 = client.post("/api/field-alerts", json=alert_payload)
    assert a1.status_code == 200 and a2.status_code == 200
    assert a1.json()["alert"]["id"] == alert_client_id
    assert a2.json()["alert"]["id"] == alert_client_id
    assert a2.json().get("idempotent_replay") is True
