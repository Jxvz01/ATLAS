"""
ATLAS 2.0 Intelligence & Open-Source Data API Router.
- Groq AI Intelligence endpoints (advisory only, grounded in live operational state)
- Open-Source Data & Satellite Imagery endpoints (Open-Meteo, USGS, NASA EONET, OSM Overpass, NASA GIBS)
"""
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.database import db
from app.services import groq_service, open_data_service

router = APIRouter(prefix="/api", tags=["ATLAS 2.0 Intelligence & Open Data"])


class OperationalQueryRequest(BaseModel):
    question: str


class FieldReportAnalysisRequest(BaseModel):
    incident_id: str
    resource_id: Optional[str] = None
    casualties: int = 0
    assessment: str
    road_condition: Optional[str] = None
    notes: Optional[str] = None


def _build_incident_context(incident_id: str) -> Dict[str, Any]:
    inc = db.incidents.get(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    assignments = [a.dict() for a in db.assignments.values() if a.incident_id == incident_id]
    available_resources = [
        {"id": r.id, "name": r.name, "type": r.type, "capabilities": r.capabilities, "status": r.status}
        for r in db.resources.values()
        if r.status == "Available"
    ]
    related_logs = [
        {"event_type": l.event_type, "message": l.message, "created_at": l.created_at}
        for l in db.activity_logs[:30]
        if l.entity_id == incident_id or incident_id in l.message
    ]
    field_alerts = []
    try:
        from app.db.postgres_store import db_store
        field_alerts = [
            a for a in db_store.list_field_alerts()
            if a.get("original_incident_id") == incident_id or a.get("new_incident_id") == incident_id
        ]
    except Exception:
        pass

    return {
        "incident": inc.dict(),
        "assignments": assignments,
        "available_resources": available_resources,
        "related_activity_logs": related_logs[:10],
        "related_field_alerts": field_alerts,
        "active_road_blockages": [
            {"id": b.id, "road_id": b.road_id, "reason": b.reason}
            for b in db.road_blockages.values()
            if b.status == "Active"
        ],
    }


@router.get("/ai/status")
def get_ai_status():
    configured = bool(settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip() != "your_groq_api_key_here")
    return {
        "available": configured,
        "provider": "Groq",
        "model": settings.GROQ_MODEL,
        "fast_model": settings.GROQ_FAST_MODEL,
        "advisory_only": True,
    }


@router.post("/ai/assess-incident/{incident_id}")
def ai_assess_incident(incident_id: str):
    ctx = _build_incident_context(incident_id)
    return groq_service.assess_incident(ctx)


@router.post("/ai/summarize-incident/{incident_id}")
def ai_summarize_incident(incident_id: str):
    ctx = _build_incident_context(incident_id)
    return groq_service.summarize_incident(ctx)


@router.post("/ai/briefing")
def ai_operational_briefing():
    field_alerts = []
    try:
        from app.db.postgres_store import db_store
        field_alerts = db_store.list_field_alerts()
    except Exception:
        pass

    incidents = [i.dict() for i in db.incidents.values()]
    resources = [r.dict() for r in db.resources.values()]
    hospitals = [h.dict() for h in db.hospitals.values()]
    referrals = [p.dict() for p in db.incoming_patients.values()]

    snapshot = {
        "counts": {
            "total_incidents": len(incidents),
            "active_incidents": sum(1 for i in incidents if i["status"] != "Resolved"),
            "critical_incidents": sum(1 for i in incidents if i["priority_level"] == "Critical" and i["status"] != "Resolved"),
            "unassigned_active": sum(1 for i in incidents if i["status"] == "Active"),
            "available_resources": sum(1 for r in resources if r["status"] == "Available"),
            "dispatched_resources": sum(1 for r in resources if r["status"] != "Available"),
            "pending_field_alerts": sum(1 for a in field_alerts if a.get("status") == "Reported"),
            "pending_referrals": sum(1 for p in referrals if p.get("status") == "En Route"),
        },
        "top_incidents": sorted(
            [
                {
                    "id": i["id"],
                    "type": i["type"],
                    "priority_level": i["priority_level"],
                    "status": i["status"],
                    "affected_population": i["affected_population"],
                    "description": i["description"][:160],
                }
                for i in incidents
                if i["status"] != "Resolved"
            ],
            key=lambda x: x["priority_level"] == "Critical",
            reverse=True,
        )[:10],
        "resources": [
            {"id": r["id"], "name": r["name"], "type": r["type"], "status": r["status"]}
            for r in resources
        ],
        "hospitals": [
            {
                "id": h["id"],
                "name": h["name"],
                "available_beds": h["available_beds"],
                "total_beds": h["total_beds"],
                "icu_capacity": h["icu_capacity"],
                "operational_status": h["operational_status"],
            }
            for h in hospitals
        ],
        "field_alerts": [
            {
                "id": a.get("id"),
                "rescuer_id": a.get("rescuer_id"),
                "emergency_type": a.get("emergency_type"),
                "status": a.get("status"),
                "urgency": a.get("urgency"),
                "new_incident_id": a.get("new_incident_id"),
            }
            for a in field_alerts[:8]
        ],
    }
    return groq_service.generate_operational_briefing(snapshot)


@router.post("/ai/predict-next-impact")
def ai_predict_next_impact():
    active_incidents = sorted(
        [i for i in db.incidents.values() if i.status != "Resolved"],
        key=lambda x: x.created_at or "",
        reverse=True,
    )
    weather = None
    eonet = None
    try:
        weather = open_data_service.fetch_open_meteo_weather()
    except Exception:
        pass
    try:
        eonet = open_data_service.fetch_nasa_eonet_events()
    except Exception:
        pass

    context = {
        "active_incidents": [
            {
                "id": i.id,
                "type": i.type,
                "priority_level": i.priority_level,
                "severity": i.severity,
                "urgency": i.urgency,
                "status": i.status,
                "latitude": i.latitude,
                "longitude": i.longitude,
                "affected_population": i.affected_population,
                "source": i.source,
                "created_at": i.created_at,
                "description": i.description[:220],
            }
            for i in active_incidents[:15]
        ],
        "weather": weather,
        "hazards": db.hazards,
        "active_road_blockages": [
            {
                "id": b.id,
                "road_id": b.road_id,
                "latitude": b.latitude,
                "longitude": b.longitude,
                "reason": b.reason,
            }
            for b in db.road_blockages.values()
            if b.status == "Active"
        ],
        "eonet_events": (eonet or {}).get("events", [])[:5] if isinstance(eonet, dict) else [],
    }
    return groq_service.predict_next_impact(context)


@router.post("/ai/analyze-field-report")
def ai_analyze_field_report(req: FieldReportAnalysisRequest):
    return groq_service.analyze_field_report(req.dict())


@router.post("/ai/query")
def ai_operational_query(req: OperationalQueryRequest):
    q = req.question.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query question cannot be empty")

    field_alerts = []
    try:
        from app.db.postgres_store import db_store
        field_alerts = db_store.list_field_alerts()
    except Exception:
        pass

    curated_context = {
        "incidents": [
            {
                "id": i.id,
                "type": i.type,
                "priority_level": i.priority_level,
                "status": i.status,
                "affected_population": i.affected_population,
                "latitude": i.latitude,
                "longitude": i.longitude,
                "description": i.description,
                "source": i.source,
            }
            for i in db.incidents.values()
        ],
        "assignments": [
            {
                "id": a.id,
                "incident_id": a.incident_id,
                "resource_id": a.resource_id,
                "assignment_status": a.assignment_status,
            }
            for a in db.assignments.values()
        ],
        "resources": [
            {"id": r.id, "name": r.name, "type": r.type, "status": r.status, "capabilities": r.capabilities}
            for r in db.resources.values()
        ],
        "hospitals": [
            {
                "id": h.id,
                "name": h.name,
                "available_beds": h.available_beds,
                "total_beds": h.total_beds,
                "icu_capacity": h.icu_capacity,
                "operational_status": h.operational_status,
            }
            for h in db.hospitals.values()
        ],
        "medical_referrals": [
            {
                "id": p.id,
                "incident_id": p.incident_id,
                "hospital_id": p.hospital_id,
                "status": p.status,
                "estimated_patient_count": p.estimated_patient_count,
                "patient_condition": p.patient_condition,
            }
            for p in db.incoming_patients.values()
        ],
        "field_alerts": field_alerts[:15],
        "road_blockages": [
            {"id": b.id, "road_id": b.road_id, "reason": b.reason, "status": b.status}
            for b in db.road_blockages.values()
        ],
    }
    return groq_service.answer_operational_query(q, curated_context)


@router.get("/open-data/overview")
def get_open_data_overview(include_osm: bool = False):
    return {
        "weather": open_data_service.fetch_open_meteo_weather(),
        "earthquakes": open_data_service.fetch_usgs_earthquakes(),
        "eonet": open_data_service.fetch_nasa_eonet_events(),
        "imagery": open_data_service.get_imagery_layers_catalog(),
        "osm": open_data_service.fetch_osm_emergency_infrastructure() if include_osm else None,
    }


@router.get("/open-data/osm-infrastructure")
def get_osm_infrastructure():
    return open_data_service.fetch_osm_emergency_infrastructure()


@router.get("/open-data/imagery-layers")
def get_imagery_layers():
    return open_data_service.get_imagery_layers_catalog()


@router.get("/open-data/gibs-layers")
def get_gibs_layers(date: Optional[str] = None):
    return open_data_service.get_gibs_layers_catalog(date_str=date)


@router.get("/open-data/eo-scenes")
def get_eo_scenes(lat: float = 12.2958, lon: float = 76.6394, max_cloud: float = 100.0):
    return open_data_service.fetch_sentinel2_stac_scenes(lat=lat, lon=lon, max_cloud=max_cloud)


@router.get("/open-data/eo-status")
def get_eo_status():
    has_oauth = bool(settings.SENTINEL_HUB_CLIENT_ID and settings.SENTINEL_HUB_CLIENT_SECRET)
    return {
        "sentinel_hub_oauth_configured": has_oauth,
        "public_stac_available": True,
        "stac_provider": "Element84 Earth Search (Sentinel-2 L2A)",
        "eo_browser_url": "https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=12.2958&lng=76.6394&themeId=DEFAULT-THEME",
        "limitation": None if has_oauth else "Sentinel Hub OAuth credentials not configured; using public Element84 STAC scene discovery, NASA GIBS temporal comparison, and external EO Browser handoff.",
    }
