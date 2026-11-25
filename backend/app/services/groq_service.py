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
