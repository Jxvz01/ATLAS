"""
ATLAS Geospatial calculations & intelligent routing with obstacle avoidance.
Computes Haversine distances, identifies route-blockage conflicts, and generates
safe multi-waypoint coordinates.
"""
import math
from typing import List, Tuple, Optional

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0 # Earth's radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def point_line_segment_distance_km(p_lat: float, p_lon: float,
                                  a_lat: float, a_lon: float,
                                  b_lat: float, b_lon: float) -> float:
    """Distance from point P to line segment AB in km using equirectangular approximation."""
    # Convert to approximate flat plane coordinates in km around Mysuru (~12.3 deg lat)
    deg_lat_km = 110.574
    deg_lon_km = 111.320 * math.cos(math.radians(a_lat))

    px = (p_lon - a_lon) * deg_lon_km
    py = (p_lat - a_lat) * deg_lat_km
    bx = (b_lon - a_lon) * deg_lon_km
    by = (b_lat - a_lat) * deg_lat_km

    seg_len_sq = bx * bx + by * by
    if seg_len_sq < 1e-9:
        return math.hypot(px, py)

    t = max(0.0, min(1.0, (px * bx + py * by) / seg_len_sq))
    proj_x = t * bx
    proj_y = t * by
    return math.hypot(px - proj_x, py - proj_y)

def check_route_blocked(origin_lat: float, origin_lon: float,
                        dest_lat: float, dest_lon: float,
                        blockages: List[dict]) -> Tuple[bool, Optional[dict]]:
    """Checks if direct segment intersects any active blockage radius."""
    for b in blockages:
        if b.get("status") == "Active":
            b_lat = b["latitude"]
            b_lon = b["longitude"]
            radius = b.get("avoid_radius_km", 0.35)
            dist = point_line_segment_distance_km(b_lat, b_lon, origin_lat, origin_lon, dest_lat, dest_lon)
            if dist < radius:
                return True, b
    return False, None

def generate_safe_route(origin_lat: float, origin_lon: float,
                        dest_lat: float, dest_lon: float,
                        blockages: List[dict]) -> Tuple[List[List[float]], float, bool]:
    """
    Generates a route as [[lon, lat], ...].
    If blocked by an obstacle, applies an intelligent detour waypoint perpendicular to obstacle.
    Returns: (coordinates, total_distance_km, is_detoured)
    """
    is_blocked, obstacle = check_route_blocked(origin_lat, origin_lon, dest_lat, dest_lon, blockages)
    
    if not is_blocked or not obstacle:
        # Standard realistic 3-point Manhattan/urban street curve
        mid_lat = (origin_lat + dest_lat) / 2.0
        coords = [
            [round(origin_lon, 5), round(origin_lat, 5)],
            [round(dest_lon, 5), round(mid_lat, 5)],
            [round(dest_lon, 5), round(dest_lat, 5)]
        ]
        dist = (haversine_distance_km(origin_lat, origin_lon, mid_lat, dest_lon) +
                haversine_distance_km(mid_lat, dest_lon, dest_lat, dest_lon))
        return coords, round(dist, 2), False

    # Detour logic: offset away from obstacle
    obs_lat = obstacle["latitude"]
    obs_lon = obstacle["longitude"]
    
    # Calculate offset vector (offset by ~0.008 deg / ~800m north/west to bypass blocked node)
    detour_lat = obs_lat + 0.0075
    detour_lon = obs_lon - 0.0075

    coords = [
        [round(origin_lon, 5), round(origin_lat, 5)],
        [round(origin_lon + (detour_lon - origin_lon) * 0.5, 5), round(origin_lat, 5)],
        [round(detour_lon, 5), round(detour_lat, 5)],
        [round(dest_lon, 5), round(detour_lat, 5)],
        [round(dest_lon, 5), round(dest_lat, 5)]
    ]
    
    # Calculate detoured distance
    dist = 0.0
    for i in range(len(coords) - 1):
        dist += haversine_distance_km(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0])
        
    return coords, round(dist, 2), True
