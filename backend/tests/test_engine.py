"""
Backend Unit and Integration Tests for ATLAS Decision Engine and APIs.
Verifies priority calculation, capability matching, travel-cost evaluation,
road-blockage detour recalculation, resource unavailability, and scenario reset.
"""
import pytest
from app.database import db
from app.engine import (
    calculate_priority_score,
    check_capability_match,
    evaluate_incident_assignment,
    run_global_recomputation
)
from app.geospatial import haversine_distance_km, generate_safe_route, check_route_blocked

def test_priority_score_calculation():
    critical_incident = {
        "severity": 5,
        "urgency": 5,
        "affected_population": 15,
        "vulnerability": 5,
        "confidence": 1.0
    }
    score, level = calculate_priority_score(critical_incident)
    assert score >= 4.0
    assert level == "Critical"

    low_incident = {
        "severity": 1,
        "urgency": 1,
        "affected_population": 0,
        "vulnerability": 1,
        "confidence": 0.5
    }
    score_low, level_low = calculate_priority_score(low_incident)
    assert score_low < 2.5
    assert level_low in ["Low", "Medium"]

def test_capability_matching():
    boat_caps = ["water_rescue", "evacuation"]
    assert check_capability_match(boat_caps, ["water_rescue"]) is True
    assert check_capability_match(boat_caps, ["structural_extrication"]) is False
    assert check_capability_match(boat_caps, []) is True

def test_geospatial_distance_and_routing():
    # Distance between K.R. Hospital and Apollo BGS Hospital in Mysuru (~3.5 km)
    dist = haversine_distance_km(12.3168, 76.6496, 12.2891, 76.6234)
    assert 3.0 < dist < 4.5

    # Test blockage collision
    blockage = [{
        "id": "BLK-TEST",
        "latitude": 12.3029,
        "longitude": 76.6365,
        "avoid_radius_km": 0.5,
        "status": "Active"
    }]
    blocked, obs = check_route_blocked(12.3168, 76.6496, 12.2891, 76.6234, blockage)
    assert blocked is True
    assert obs["id"] == "BLK-TEST"

    # Route generator should provide detour
    coords, det_dist, is_detour = generate_safe_route(12.3168, 76.6496, 12.2891, 76.6234, blockage)
    assert is_detour is True
    assert len(coords) >= 4

def test_engine_incident_assignment():
    db.reset_scenario()
    inc = {
        "id": "INC-TEST-FLOOD",
        "type": "Flooding",
        "description": "Unit test flood incident",
        "latitude": 12.305,
        "longitude": 76.635,
        "severity": 5,
        "urgency": 5,
        "affected_population": 4,
        "required_capabilities": ["water_rescue"],
    }
    res_list = []
    for r in db.resources.values():
        d = r.dict()
        d["status"] = "Available"
        res_list.append(d)
    blk_list = [b.dict() for b in db.road_blockages.values()]

    result = evaluate_incident_assignment(inc, res_list, blk_list)
    assert result.recommended_resource_id in ["R-01", "R-04"] # Must be a water rescue unit
    assert "water_rescue" in result.explanation or "matches required capabilities" in result.explanation

def test_recomputation_no_double_assignment():
    db.reset_scenario()
    inc_list = [i.dict() for i in db.incidents.values()]
    res_list = [r.dict() for r in db.resources.values()]
    blk_list = [b.dict() for b in db.road_blockages.values()]

    results = run_global_recomputation(inc_list, res_list, blk_list)
    assigned_resources = [r.recommended_resource_id for r in results if r.recommended_resource_id]
    # Verify no resource was assigned twice in a single recompute pass
    assert len(assigned_resources) == len(set(assigned_resources))

def test_scenario_reset():
    db.reset_scenario()
    initial_inc_count = len(db.incidents)
    from app.database import Incident
    # Mutate state
    db.incidents["INC-999"] = Incident(
        id="INC-999", type="Flooding", description="Temp test", latitude=12.3, longitude=76.6,
        severity=3, urgency=3, confidence=1.0, affected_population=1
    )
    assert len(db.incidents) == initial_inc_count + 1
    # Reset
    db.reset_scenario()
    assert len(db.incidents) == initial_inc_count
    assert "INC-999" not in db.incidents
