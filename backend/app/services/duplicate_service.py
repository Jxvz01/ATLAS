"""
Deterministic Duplicate Incident Detection Service.
Evaluates geospatial distance, temporal proximity, incident category match, and description overlap.
Returns scored duplicate candidates for authorized admin review. Never silently mutates or merges data.
"""
import math
from typing import List, Tuple
from datetime import datetime, timezone
from app.domain.models import IncidentRecord, DuplicateCandidate
from app.domain.enums import IncidentStatus

# Configurable detection thresholds
DISTANCE_THRESHOLD_METERS = 750.0  # Within 750m is a spatial candidate
TIME_WINDOW_HOURS = 4.0            # Within 4 hours is a temporal candidate
MIN_CONFIDENCE_THRESHOLD = 0.55    # Minimum candidate confidence score to flag

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes accurate geodesic surface distance in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def token_similarity(text1: str, text2: str) -> float:
    """Computes deterministic Jaccard token overlap between normalized text strings."""
    if not text1 or not text2:
        return 0.0
    
    stop_words = {"the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or", "near", "with", "is", "are"}
    
    tokens1 = set([w.strip().lower() for w in text1.split() if len(w) > 2 and w.lower() not in stop_words])
    tokens2 = set([w.strip().lower() for w in text2.split() if len(w) > 2 and w.lower() not in stop_words])
    
    if not tokens1 or not tokens2:
        return 0.0
    
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    return len(intersection) / float(len(union))

def parse_iso(dt_str: str) -> datetime:
    try:
        return datetime.fromisoformat(dt_str)
    except Exception:
        return datetime.now(timezone.utc)

class DuplicateDetector:
    @staticmethod
    def check_for_duplicates(
        new_incident: IncidentRecord,
        existing_incidents: List[IncidentRecord],
        distance_threshold: float = DISTANCE_THRESHOLD_METERS,
        time_window_hours: float = TIME_WINDOW_HOURS
    ) -> List[DuplicateCandidate]:
        """
        Scans existing operational incidents and scores duplicate probability deterministically.
        Only non-resolved, non-rejected incidents within spatial/temporal bounds are evaluated.
        """
        candidates: List[DuplicateCandidate] = []
        new_dt = parse_iso(new_incident.reported_at or new_incident.created_at)

        for existing in existing_incidents:
            if existing.id == new_incident.id:
                continue
            
            # Closed/Rejected incidents are rarely active duplicates
            if existing.status in [IncidentStatus.REJECTED, IncidentStatus.CLOSED]:
                continue

            dist_m = haversine_distance_meters(
                new_incident.latitude, new_incident.longitude,
                existing.latitude, existing.longitude
            )

            # Spatial guard
            if dist_m > distance_threshold:
                continue

            exist_dt = parse_iso(existing.reported_at or existing.created_at)
            time_diff_min = abs((new_dt - exist_dt).total_seconds()) / 60.0

            # Temporal guard
            if time_diff_min > (time_window_hours * 60.0):
                continue

            # Compute Multi-factor Confidence Score
            # 1. Distance Score: 1.0 at 0m, decaying to 0.0 at distance_threshold
            dist_score = max(0.0, 1.0 - (dist_m / distance_threshold))

            # 2. Time Score: 1.0 at 0 min, decaying over time window
            time_score = max(0.0, 1.0 - (time_diff_min / (time_window_hours * 60.0)))

            # 3. Type Score: Exact match = 1.0, mismatch = 0.0 (different incident types at same spot are distinct events)
            type_score = 1.0 if new_incident.type == existing.type else 0.0

            # If types don't match, they should not be considered duplicate emergencies
            if new_incident.type != existing.type:
                continue

            # 4. Description overlap score
            text_score = token_similarity(new_incident.description, existing.description)

            # Weighted deterministic combination:
            # Distance (40%) + Type (30%) + Time (20%) + Text (10%)
            confidence = (0.40 * dist_score) + (0.30 * type_score) + (0.20 * time_score) + (0.10 * text_score)

            reasons: List[str] = []
            if dist_m < 150.0:
                reasons.append(f"Immediate spatial proximity ({dist_m:.0f}m)")
            else:
                reasons.append(f"Nearby geographical locus ({dist_m:.0f}m)")

            if new_incident.type == existing.type:
                reasons.append(f"Identical emergency type ({new_incident.type.value})")

            if time_diff_min < 30.0:
                reasons.append(f"Reported within {time_diff_min:.0f} mins")

            if text_score > 0.25:
                reasons.append(f"Significant keyword description overlap ({int(text_score*100)}%)")

            if confidence >= MIN_CONFIDENCE_THRESHOLD:
                candidates.append(DuplicateCandidate(
                    existing_incident_id=existing.id,
                    existing_incident_type=existing.type.value,
                    existing_status=existing.status.value,
                    distance_meters=round(dist_m, 1),
                    time_difference_minutes=round(time_diff_min, 1),
                    description_similarity=round(text_score, 2),
                    confidence_score=round(confidence, 2),
                    reasons=reasons
                ))

        # Sort descending by confidence score
        candidates.sort(key=lambda c: c.confidence_score, reverse=True)
        return candidates
