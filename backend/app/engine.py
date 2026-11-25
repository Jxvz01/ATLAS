"""
ATLAS Transparent, Deterministic Decision Engine.
Implements multi-criteria incident scoring, capability matching, travel-cost
evaluation, road-network conflict verification, and explainable allocation.
"""
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime
from app.geospatial import haversine_distance_km, generate_safe_route, check_route_blocked

# Configurable Weights for Incident Priority Scoring:
# P = w1*Severity + w2*Urgency + w3*Exposure(affected_pop) + w4*Vulnerability + w5*Waiting(time)
DEFAULT_WEIGHTS = {
    "severity": 0.30,
    "urgency": 0.25,
    "exposure": 0.20,
    "vulnerability": 0.15,
    "confidence": 0.10
}

# Thresholds for priority level classification
THRESHOLDS = {
    "Critical": 4.0,
    "High": 3.0,
    "Medium": 2.0,
    "Low": 0.0
}

# Capability Mapping
INCIDENT_CAPABILITY_MAP = {
    "Flooding": ["water_rescue", "evacuation"],
    "Trapped People": ["structural_extrication", "water_rescue"],
    "Trapped / Need Rescue": ["structural_extrication", "water_rescue", "evacuation"],
    "Medical Emergency": ["medical_trauma", "critical_transport", "first_aid"],
    "Medical / Injury": ["medical_trauma", "critical_transport", "first_aid"],
    "Road Blockage": ["debris_clearance"],
    "Fire": ["fire_suppression", "structural_extrication"],
    "Structural Damage": ["structural_extrication", "debris_clearance"],
    "Hazardous Spill": ["hazmat_containment"],
    "Other": ["first_aid", "evacuation"]
}

class EngineResult:
    def __init__(self, incident_id: str, recommended_resource_id: Optional[str],
                 priority_score: float, priority_level: str,
                 explanation: str, route_geometry: Optional[List[List[float]]] = None,
                 distance_km: float = 0.0, is_detour: bool = False,
                 candidate_evaluations: Optional[List[Dict[str, Any]]] = None):
        self.incident_id = incident_id
        self.recommended_resource_id = recommended_resource_id
        self.priority_score = priority_score
        self.priority_level = priority_level
        self.explanation = explanation
        self.route_geometry = route_geometry
        self.distance_km = distance_km
        self.is_detour = is_detour
        self.candidate_evaluations = candidate_evaluations or []

    def to_dict(self):
        return {
            "incident_id": self.incident_id,
            "recommended_resource_id": self.recommended_resource_id,
            "priority_score": self.priority_score,
            "priority_level": self.priority_level,
            "explanation": self.explanation,
            "route_geometry": self.route_geometry,
            "distance_km": self.distance_km,
            "is_detour": self.is_detour,
            "candidate_evaluations": self.candidate_evaluations
        }

def calculate_priority_score(incident: dict, weights: Optional[Dict[str, float]] = None) -> Tuple[float, str]:
    """
    Computes a deterministic priority score between 1.0 and 5.0.
    Normalizes affected_population up to 20 people = 5.0 scale.
    """
    w = weights or DEFAULT_WEIGHTS
    sev = float(incident.get("severity", 3))
    urg = float(incident.get("urgency", 3))
    vuln = float(incident.get("vulnerability", 3))
    conf = float(incident.get("confidence", 0.9))
    
    # Exposure scale: 0 -> 1.0, 20+ -> 5.0
    raw_pop = float(incident.get("affected_population", 1))
    exposure = min(5.0, 1.0 + (raw_pop / 5.0))

    score = (
        (sev * w["severity"]) +
        (urg * w["urgency"]) +
        (exposure * w["exposure"]) +
        (vuln * w["vulnerability"]) +
        (conf * 5.0 * w["confidence"])
    )
    score = round(min(5.0, max(1.0, score)), 2)

    level = "Low"
    if score >= THRESHOLDS["Critical"]:
        level = "Critical"
    elif score >= THRESHOLDS["High"]:
        level = "High"
    elif score >= THRESHOLDS["Medium"]:
        level = "Medium"
        
    return score, level

def check_capability_match(resource_caps: List[str], required_caps: List[str]) -> bool:
    """True if the resource possesses at least one of the essential required capabilities."""
    if not required_caps:
        return True
    return any(cap in resource_caps for cap in required_caps)

def evaluate_incident_assignment(incident: dict,
                                 resources: List[dict],
                                 blockages: List[dict],
                                 weights: Optional[Dict[str, float]] = None) -> EngineResult:
    """
    Evaluates an incident against all candidate resources and produces an explainable recommendation.
    """
    p_score, p_level = calculate_priority_score(incident, weights)
    
    req_caps = incident.get("required_capabilities")
    if not req_caps:
        req_caps = INCIDENT_CAPABILITY_MAP.get(incident.get("type", "Other"), ["evacuation"])

    inc_lat = incident["latitude"]
    inc_lon = incident["longitude"]

    candidate_evaluations = []
    eligible_candidates = []

    for r in resources:
        r_id = r["id"]
        r_caps = r.get("capabilities", [])
        status = r.get("status", "Available")
        r_lat = r["latitude"]
        r_lon = r["longitude"]

        has_cap = check_capability_match(r_caps, req_caps)
        is_avail = (status == "Available")

        # Check route & road blockages
        coords, dist_km, is_detour = generate_safe_route(r_lat, r_lon, inc_lat, inc_lon, blockages)
        direct_blocked, obstacle = check_route_blocked(r_lat, r_lon, inc_lat, inc_lon, blockages)

        eval_summary = {
            "resource_id": r_id,
            "name": r.get("name"),
            "status": status,
            "has_capability": has_cap,
            "distance_km": dist_km,
            "direct_blocked": direct_blocked,
            "is_detour": is_detour,
            "eligible": (is_avail and has_cap)
        }
        candidate_evaluations.append(eval_summary)

        if is_avail and has_cap:
            eligible_candidates.append({
                "resource": r,
                "distance_km": dist_km,
                "coords": coords,
                "is_detour": is_detour,
                "direct_blocked": direct_blocked,
                "obstacle": obstacle
            })

    # Sort eligible candidates by shortest travel distance
    eligible_candidates.sort(key=lambda x: x["distance_km"])

    if not eligible_candidates:
        # Generate clear explanation why no unit could be assigned
        if not any(r.get("status") == "Available" for r in resources):
            explanation = f"Incident {incident['id']} prioritized as {p_level} (Score {p_score}), but all response units are currently committed or unavailable."
        else:
            explanation = f"Incident {incident['id']} requires {req_caps}, but no currently available units possess matching capabilities."
        
        return EngineResult(
            incident_id=incident["id"],
            recommended_resource_id=None,
            priority_score=p_score,
            priority_level=p_level,
            explanation=explanation,
            candidate_evaluations=candidate_evaluations
        )

    best = eligible_candidates[0]
    best_r = best["resource"]
    route_status = "direct accessible road" if not best["direct_blocked"] else "alternate detour circumventing active blockage"

    explanation = (
        f"Unit {best_r['id']} ({best_r['name']}) recommended: matches required capabilities {req_caps}, "
        f"is operational & Available, and has shortest arrival distance ({best['distance_km']} km) via {route_status}."
    )

    return EngineResult(
        incident_id=incident["id"],
        recommended_resource_id=best_r["id"],
        priority_score=p_score,
        priority_level=p_level,
        explanation=explanation,
        route_geometry=best["coords"],
        distance_km=best["distance_km"],
        is_detour=best["is_detour"],
        candidate_evaluations=candidate_evaluations
    )

def run_global_recomputation(incidents: List[dict],
                             resources: List[dict],
                             blockages: List[dict]) -> List[EngineResult]:
    """
    Ranks unassigned/active incidents by priority score descending and performs
    deterministic resource allocation.
    """
    # Filter active/unassigned incidents
    active_incidents = [inc for inc in incidents if inc.get("status") in ["Active", "Unassigned"]]
    
    # Pre-score and sort by priority score descending
    scored = []
    for inc in active_incidents:
        score, level = calculate_priority_score(inc)
        inc_copy = dict(inc)
        inc_copy["priority_score"] = score
        inc_copy["priority_level"] = level
        scored.append(inc_copy)
    scored.sort(key=lambda x: x["priority_score"], reverse=True)

    available_resources = [dict(r) for r in resources if r.get("status") == "Available"]
    results = []

    for inc in scored:
        eval_res = evaluate_incident_assignment(inc, available_resources, blockages)
        results.append(eval_res)
        # If resource recommended, remove from pool for this greedy pass to avoid double assignment
        if eval_res.recommended_resource_id:
            available_resources = [r for r in available_resources if r["id"] != eval_res.recommended_resource_id]

    return results
