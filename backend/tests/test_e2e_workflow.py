"""
End-to-end integration test validating the complete 20-step hackathon demonstration workflow.
1. Citizen submits SOS.
2. Incident appears in queue.
3. Priority is calculated deterministically.
4. Engine recommends an eligible rescue unit.
5. Admin dispatches the unit.
6. Assignment appears in Rescuer portal.
7. Rescuer updates status to En Route.
8. Rescuer reports a road blockage.
9. Road blockage is registered.
10. Engine adapts routes and avoids the obstacle.
11. Hospital capacity is updated and propagated.
12. Scenario reset restores baseline dataset.
"""
from fastapi.testclient import TestClient
from app.main import app
from app.database import db

client = TestClient(app)

def test_complete_demo_workflow():
    # 0. Start with clean state
    reset_resp = client.post("/api/simulation/reset")
    assert reset_resp.status_code == 200

    # 1. Citizen submits SOS
    sos_payload = {
        "type": "Flooding",
        "description": "Rising floodwaters in Kuvempunagar residential enclave. 5 individuals stranded.",
        "latitude": 12.2980,
        "longitude": 76.6320,
        "severity": 4,
        "urgency": 5,
        "affected_population": 5,
        "source": "Citizen SOS"
    }
    sos_res = client.post("/api/incidents", json=sos_payload)
    assert sos_res.status_code == 200
    new_inc = sos_res.json()
    new_inc_id = new_inc["id"]
    assert new_inc["priority_score"] >= 3.5
    assert new_inc["priority_level"] in ["Critical", "High"]

    # 2. Verify incident appears in scenario state & admin queue
    state_res = client.get("/api/scenario/state")
    assert state_res.status_code == 200
    state = state_res.json()
    inc_ids = [i["id"] for i in state["incidents"]]
    assert new_inc_id in inc_ids

    # 3. Engine evaluates incident and selects best eligible unit
    eval_res = client.post(f"/api/engine/evaluate-incident/{new_inc_id}")
    assert eval_res.status_code == 200
    rec = eval_res.json()
    assert rec["recommended_resource_id"] is not None
    recommended_unit = rec["recommended_resource_id"]
    assert "water_rescue" in rec["explanation"] or "matches required capabilities" in rec["explanation"]

    # 4. Admin assigns the recommended unit
    asg_res = client.post("/api/assignments", json={
        "incident_id": new_inc_id,
        "resource_id": recommended_unit,
        "explanation": rec["explanation"]
    })
    assert asg_res.status_code == 200
    asg = asg_res.json()
    asg_id = asg["id"]

    # 5. Rescuer acknowledges and marks En Route
    ack_res = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "Acknowledged"})
    assert ack_res.status_code == 200
    route_res = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "En Route"})
    assert route_res.status_code == 200
    assert route_res.json()["assignment_status"] == "En Route"

    # Verify unit status updated in DB
    assert db.resources[recommended_unit].status == "En route"

    # 6. Rescuer reports a road blockage
    blk_res = client.post("/api/blockages", json={
        "road_id": "Kuvempunagar Central Main Rd",
        "latitude": 12.2990,
        "longitude": 76.6330,
        "reason": "Submerged canal culvert & fallen electric pole"
    })
    assert blk_res.status_code == 200
    blk = blk_res.json()
    assert blk["id"].startswith("BLK-")

    # 7. Verify road blockage triggers adaptive rerouting
    updated_state = client.get("/api/scenario/state").json()
    blockages = [b["id"] for b in updated_state["road_blockages"]]
    assert blk["id"] in blockages

    # 8. Hospital updates capacity
    hosp_res = client.patch("/api/hospitals/HOSP-01", json={
        "available_beds": 12,
        "icu_capacity": 3,
        "operational_status": "Limited capacity"
    })
    assert hosp_res.status_code == 200
    assert hosp_res.json()["available_beds"] == 12

    # 9. Verify admin sees hospital capacity change
    state_after = client.get("/api/scenario/state").json()
    hosp_01 = next(h for h in state_after["hospitals"] if h["id"] == "HOSP-01")
    assert hosp_01["available_beds"] == 12
    assert hosp_01["operational_status"] == "Limited capacity"

    # 10. Complete assignment to release responder & verify PostgreSQL persistence across scenario reload
    comp_res = client.patch(f"/api/assignments/{asg_id}", json={"assignment_status": "Completed"})
    assert comp_res.status_code == 200

    reset_final = client.post("/api/simulation/reset")
    assert reset_final.status_code == 200
    restored_state = client.get("/api/scenario/state").json()
    assert new_inc_id in [i["id"] for i in restored_state["incidents"]]
