from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_ai_status_endpoint():
    res = client.get("/api/ai/status")
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "Groq"
    assert data["advisory_only"] is True
    assert "model" in data
    assert "available" in data


def test_ai_endpoints_graceful_handling_and_grounding():
    # Assess incident
    res_assess = client.post("/api/ai/assess-incident/INC-101")
    assert res_assess.status_code == 200
    d_assess = res_assess.json()
    assert "available" in d_assess
    assert "timestamp" in d_assess
    assert "provenance" in d_assess

    # Summarize incident
    res_sum = client.post("/api/ai/summarize-incident/INC-101")
    assert res_sum.status_code == 200
    assert "available" in res_sum.json()

    # Operational briefing
    res_brief = client.post("/api/ai/briefing")
    assert res_brief.status_code == 200
    assert "available" in res_brief.json()

    # Field report analysis
    res_fr = client.post("/api/ai/analyze-field-report", json={
        "incident_id": "INC-101",
        "resource_id": "R-04",
        "casualties": 2,
        "assessment": "Water level 4ft, 2 elderly residents need evacuation.",
        "road_condition": "Submerged"
    })
    assert res_fr.status_code == 200
    assert "available" in res_fr.json()

    # Operational query validation & response
    res_empty = client.post("/api/ai/query", json={"question": "   "})
    assert res_empty.status_code == 400

    res_q = client.post("/api/ai/query", json={"question": "Which incidents have no assigned responders?"})
    assert res_q.status_code == 200
    assert "available" in res_q.json()


def test_open_data_imagery_and_overview():
    res_img = client.get("/api/open-data/imagery-layers")
    assert res_img.status_code == 200
    layers = res_img.json()["layers"]
    ids = {l["id"] for l in layers}
    assert {"satellite", "gibs-viirs", "street", "terrain"}.issubset(ids)
    for layer in layers:
        assert "attribution" in layer
        assert "acquisition_date" in layer
        assert "tile_url" in layer

    res_ov = client.get("/api/open-data/overview")
    assert res_ov.status_code == 200
    ov = res_ov.json()
    assert "weather" in ov
    assert "earthquakes" in ov
    assert "eonet" in ov
    assert "imagery" in ov
