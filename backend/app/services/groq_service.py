"""
Groq AI Intelligence Service for ATLAS 2.0.
Provides grounded, advisory-only incident assessment, summarization,
operational briefings, field report analysis, and natural-language queries.
Never fabricates operational data and never executes autonomous dispatch.
"""
import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from app.config import settings

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_GUARDRAIL = (
    "You are ATLAS AI, an assistive disaster-response intelligence analyst for incident commanders. "
    "You are ADVISORY ONLY — you do NOT have authority to dispatch units or change incident priorities. "
    "STRICT GROUNDING RULE: Base every claim strictly on the provided operational records JSON. "
    "NEVER invent or fabricate coordinates, responder locations, hospital bed counts, casualties, "
    "road closures, or satellite observations. If data is missing or uncertain, explicitly state "
    "'Data unavailable' or list it under uncertainties."
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _call_groq(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    json_mode: bool = False,
    max_tokens: int = 2048,
) -> Dict[str, Any]:
    """
    Calls the Groq Chat Completions API with timeout, retry on 429/5xx,
    and graceful unavailable handling when GROQ_API_KEY is missing or unreachable.
    """
    api_key = (settings.GROQ_API_KEY or "").strip()
    chosen_model = model or settings.GROQ_MODEL
    ts = _utc_now()

    if not api_key or api_key == "your_groq_api_key_here":
        return {
            "available": False,
            "status": "unavailable",
            "reason": "GROQ_API_KEY is not configured in backend environment.",
            "model": chosen_model,
            "timestamp": ts,
            "ai_generated": False,
        }

    payload: Dict[str, Any] = {
        "model": chosen_model,
        "messages": messages,
        "temperature": 0.15,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_error = "Unknown error"
    for attempt in range(2):
        try:
            with httpx.Client(timeout=settings.GROQ_TIMEOUT_SECONDS) as client:
                resp = client.post(GROQ_API_URL, headers=headers, json=payload)

            if resp.status_code == 200:
                body = resp.json()
                content = body["choices"][0]["message"]["content"]
                return {
                    "available": True,
                    "status": "ok",
                    "content": content,
                    "model": body.get("model", chosen_model),
                    "usage": body.get("usage", {}),
                    "timestamp": ts,
                    "ai_generated": True,
                }
            elif resp.status_code == 400 and "response_format" in payload and attempt == 0:
                # Fallback if strict json_object validation fails on long reasoning output
                payload.pop("response_format", None)
                last_error = f"Groq API returned HTTP 400."
                continue
            elif resp.status_code == 429:
                last_error = "Groq API rate limit reached (429)."
                if attempt == 0:
                    time.sleep(1.0)
                    continue
            elif resp.status_code in (401, 403):
                return {
                    "available": False,
                    "status": "auth_error",
                    "reason": "Groq API authentication failed. Verify GROQ_API_KEY.",
                    "model": chosen_model,
                    "timestamp": ts,
                    "ai_generated": False,
                }
            else:
                last_error = f"Groq API returned HTTP {resp.status_code}."
        except httpx.TimeoutException:
            last_error = f"Groq API timed out after {settings.GROQ_TIMEOUT_SECONDS}s."
        except Exception as exc:
            last_error = f"Groq API connection error: {type(exc).__name__}"

    return {
        "available": False,
        "status": "error",
        "reason": last_error,
        "model": chosen_model,
        "timestamp": ts,
        "ai_generated": False,
    }


def assess_incident(incident_context: Dict[str, Any]) -> Dict[str, Any]:
    prompt = (
        "Analyze the following ATLAS incident record and supporting operational context. "
        "Return a JSON object with keys: "
        '"summary" (string), '
        '"urgency_considerations" (list of strings), '
        '"operational_risks" (list of strings), '
        '"verify_next" (list of strings), '
        '"suggested_capabilities" (list of strings), '
        '"coordination_considerations" (list of strings), '
        '"uncertainties" (list of strings).\n\n'
        f"CONTEXT JSON:\n{json.dumps(incident_context, default=str)}"
    )
    res = _call_groq(
        [
            {"role": "system", "content": SYSTEM_GUARDRAIL},
            {"role": "user", "content": prompt},
        ],
        model=settings.GROQ_MODEL,
        json_mode=True,
    )
    if not res["available"]:
        return {**res, "provenance": "ATLAS Operational DB (AI Unavailable)"}

    try:
        parsed = json.loads(res["content"])
    except Exception:
        parsed = {"summary": res["content"], "uncertainties": ["Structured JSON parse fallback."]}

    return {
        "available": True,
        "status": "ok",
        "ai_generated": True,
        "advisory_only": True,
        "model": res["model"],
        "timestamp": res["timestamp"],
        "provenance": f"Grounded in Incident {incident_context.get('incident', {}).get('id', 'Unknown')} + live DB state",
        "assessment": parsed,
    }


def summarize_incident(incident_context: Dict[str, Any]) -> Dict[str, Any]:
    prompt = (
        "Produce a concise, grounded operational summary of this incident in JSON format with keys: "
        '"what_happened" (string), '
        '"current_status" (string), '
        '"affected_individuals" (string), '
        '"current_response" (string), '
        '"latest_field_reports" (string), '
        '"medical_requirements" (string), '
        '"outstanding_tasks" (list of strings), '
        '"uncertainties" (list of strings).\n\n'
        f"CONTEXT JSON:\n{json.dumps(incident_context, default=str)}"
    )
    res = _call_groq(
        [
            {"role": "system", "content": SYSTEM_GUARDRAIL},
            {"role": "user", "content": prompt},
        ],
        model=settings.GROQ_FAST_MODEL,
        json_mode=True,
    )
    if not res["available"]:
        return {**res, "provenance": "ATLAS Operational DB (AI Unavailable)"}

    try:
        parsed = json.loads(res["content"])
    except Exception:
        parsed = {"what_happened": res["content"], "uncertainties": ["Structured JSON parse fallback."]}

    return {
        "available": True,
        "status": "ok",
        "ai_generated": True,
        "advisory_only": True,
        "model": res["model"],
        "timestamp": res["timestamp"],
        "provenance": f"Grounded in Incident {incident_context.get('incident', {}).get('id', 'Unknown')} records",
        "summary": parsed,
    }


def generate_operational_briefing(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    prompt = (
        "Generate an executive disaster-operations command briefing from this live ATLAS state snapshot. "
        "Return a JSON object with keys: "
        '"headline" (string), '
        '"situation_overview" (string), '
        '"critical_and_unassigned" (list of strings), '
        '"resource_and_hospital_status" (string), '
        '"field_alerts_and_decisions" (list of strings), '
        '"emerging_concerns" (list of strings), '
        '"uncertainties" (list of strings).\n\n'
        f"OPERATIONAL SNAPSHOT JSON:\n{json.dumps(snapshot, default=str)}"
    )
    res = _call_groq(
        [
            {"role": "system", "content": SYSTEM_GUARDRAIL},
            {"role": "user", "content": prompt},
        ],
        model=settings.GROQ_MODEL,
        json_mode=True,
        max_tokens=2048,
    )
    if not res["available"]:
        return {**res, "provenance": "ATLAS Live Operational Snapshot (AI Unavailable)"}

    try:
        parsed = json.loads(res["content"])
    except Exception:
        parsed = {"headline": "Operational Briefing", "situation_overview": res["content"]}

    return {
        "available": True,
        "status": "ok",
        "ai_generated": True,
        "advisory_only": True,
        "model": res["model"],
        "timestamp": res["timestamp"],
        "provenance": "Grounded in live ATLAS incidents, resources, hospitals, referrals & field alerts",
        "briefing": parsed,
    }


def predict_next_impact(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predicts where the next hazard/impact is likely to occur strictly grounded
    in live incident locations/timestamps/severities, Open-Meteo weather/rainfall,
    hazards, and road blockages. Never invents coordinates or observations.
    """
    active_incidents = context.get("active_incidents") or []
    if not active_incidents:
        return {
            "available": True,
            "status": "ok",
            "ai_generated": False,
            "advisory_only": True,
            "model": settings.GROQ_MODEL,
            "timestamp": _utc_now(),
            "provenance": "ATLAS Operational DB (Insufficient active incident data)",
            "prediction": {
                "sufficient_data": False,
                "message": "Insufficient data for reliable impact prediction.",
                "location": "Unknown",
                "hazard": "Unknown",
                "eta": "Unknown",
                "risk": "Low",
                "confidence": "Insufficient Data",
                "why": "No active operational incidents are currently present to project next-impact risk.",
                "supporting_evidence": [],
                "recommended_actions": [],
                "uncertainties": ["No active incidents in operational database."],
                "predicted_zone": None,
            },
        }

    prompt = (
        "Analyze the live ATLAS operational incidents, timestamps, weather/rainfall data, hazards, and road blockages "
        "to predict WHERE THE NEXT IMPACT IS MOST LIKELY TO OCCUR.\n"
        "HONESTY & GROUNDING RULES:\n"
        "- Use ONLY the coordinates, localities, weather/rainfall, and hazard data present in the CONTEXT JSON.\n"
        "- NEVER invent weather measurements, satellite observations, or fabricated coordinates.\n"
        "- If evidence is too sparse or contradictory to make a credible spatial prediction, set \"sufficient_data\": false "
        "and \"message\": \"Insufficient data for reliable impact prediction.\".\n"
        "- If \"sufficient_data\" is true, derive \"predicted_zone\" center_lat and center_lon directly from the active "
        "incident cluster or downstream/adjacent hazard coordinates in the context.\n\n"
        "Return a JSON object with exact keys:\n"
        '- "sufficient_data" (boolean)\n'
        '- "message" (string, e.g. "Insufficient data for reliable impact prediction." if false, else brief headline)\n'
        '- "location" (string: specific locality, district, or geographic zone)\n'
        '- "hazard" (string: predicted hazard type)\n'
        '- "eta" (string: estimated time window or "Unknown")\n'
        '- "risk" (string: one of "Low", "Moderate", "High", "Critical")\n'
        '- "confidence" (string: e.g. "Low (35%)", "Moderate (65%)", "High (80%)")\n'
        '- "why" (string: concise explanation grounded in specific incident IDs and weather/hazard data)\n'
        '- "supporting_evidence" (list of strings: incident IDs and weather/hazard facts used)\n'
        '- "recommended_actions" (list of up to 3 concise action strings)\n'
        '- "uncertainties" (list of strings)\n'
        '- "predicted_zone" (null OR object {"center_lat": float, "center_lon": float, "radius_km": float, "direction_bearing_deg": float or null})\n\n'
        f"CONTEXT JSON:\n{json.dumps(context, default=str)}"
    )
    res = _call_groq(
        [
            {"role": "system", "content": SYSTEM_GUARDRAIL},
            {"role": "user", "content": prompt},
        ],
        model=settings.GROQ_MODEL,
        json_mode=True,
        max_tokens=1536,
    )
    if not res["available"]:
        return {**res, "provenance": "ATLAS Live Operational Snapshot (AI Unavailable)"}

    try:
        parsed = json.loads(res["content"])
    except Exception:
        parsed = {
            "sufficient_data": False,
            "message": "Insufficient data for reliable impact prediction.",
            "location": "Unknown",
            "hazard": "Unknown",
            "eta": "Unknown",
            "risk": "Moderate",
            "confidence": "Low",
            "why": res["content"],
            "supporting_evidence": [],
            "recommended_actions": [],
            "uncertainties": ["Structured JSON parse fallback."],
            "predicted_zone": None,
        }

    return {
        "available": True,
        "status": "ok",
        "ai_generated": True,
        "advisory_only": True,
        "model": res["model"],
        "timestamp": res["timestamp"],
        "provenance": "Grounded in live active incidents, timestamps, Open-Meteo weather & hazard zones",
        "prediction": parsed,
    }


def analyze_field_report(report_data: Dict[str, Any]) -> Dict[str, Any]:
    prompt = (
        "Extract structured operational intelligence from this rescuer field report. "
        "Clearly distinguish reported facts from inferred needs. Return JSON with keys: "
        '"concise_summary" (string), '
        '"identified_hazards" (list of strings), '
        '"reported_casualties" (string), '
        '"required_equipment" (list of strings), '
        '"potential_medical_needs" (list of strings), '
        '"coordination_recommendations" (list of strings).\n\n'
        f"FIELD REPORT JSON:\n{json.dumps(report_data, default=str)}"
    )
    res = _call_groq(
        [
            {"role": "system", "content": SYSTEM_GUARDRAIL},
            {"role": "user", "content": prompt},
        ],
        model=settings.GROQ_FAST_MODEL,
        json_mode=True,
    )
    if not res["available"]:
        return {**res, "provenance": "Field Report Record (AI Unavailable)"}

    try:
        parsed = json.loads(res["content"])
    except Exception:
        parsed = {"concise_summary": res["content"]}

    return {
        "available": True,
        "status": "ok",
        "ai_generated": True,
        "advisory_only": True,
        "model": res["model"],
        "timestamp": res["timestamp"],
        "provenance": f"Field Report for {report_data.get('incident_id', 'Unknown')}",
        "analysis": parsed,
    }


def answer_operational_query(question: str, curated_context: Dict[str, Any]) -> Dict[str, Any]:
    prompt = (
        "Answer the incident commander's operational question using ONLY the curated backend data below. "
        "Return JSON with keys: "
        '"answer" (string, concise and factual), '
        '"supporting_ids" (list of entity IDs referenced, e.g. INC-101, R-04, HOSP-01), '
        '"suggested_next_steps" (list of advisory strings), '
        '"data_gaps" (list of strings if any requested information is unavailable).\n\n'
        f"COMMANDER QUESTION: {question}\n\n"
        f"AUTHORIZED BACKEND DATA:\n{json.dumps(curated_context, default=str)}"
    )
    res = _call_groq(
        [
            {"role": "system", "content": SYSTEM_GUARDRAIL},
            {"role": "user", "content": prompt},
        ],
        model=settings.GROQ_MODEL,
        json_mode=True,
    )
    if not res["available"]:
        return {**res, "provenance": "ATLAS Authorized Backend Query (AI Unavailable)"}

    try:
        parsed = json.loads(res["content"])
    except Exception:
        parsed = {"answer": res["content"], "supporting_ids": [], "suggested_next_steps": [], "data_gaps": []}

    return {
        "available": True,
        "status": "ok",
        "ai_generated": True,
        "advisory_only": True,
        "model": res["model"],
        "timestamp": res["timestamp"],
        "provenance": "Controlled backend operational query (no direct SQL)",
        "result": parsed,
    }
