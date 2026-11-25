"""
Open-Source Geographic, Satellite Imagery & Disaster Data Adapters for ATLAS 2.0.
Integrates:
1. Open-Meteo (live meteorological observations & precipitation)
2. NASA EONET v3 (open natural disaster / hazard events)
3. USGS Earthquake Hazards (FDSNWS GeoJSON seismic feed)
4. OpenStreetMap Overpass API (real hospitals, fire stations, emergency POIs)
5. Legitimate Satellite & Basemap Imagery Layer Catalog (NASA GIBS VIIRS, Esri Static, OSM, OpenTopoMap)

All external requests use short timeouts, TTL caching, explicit attribution,
acquisition timestamps, and honest error/unavailable reporting.
"""
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import httpx

# Default operational center: Mysuru, India
DEFAULT_LAT = 12.2958
DEFAULT_LON = 76.6394

_CACHE: Dict[str, Dict[str, Any]] = {}


def _get_cached(key: str, ttl_seconds: int) -> Optional[Any]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < ttl_seconds:
        return entry["data"]
    return None


def _set_cached(key: str, data: Any) -> Any:
    _CACHE[key] = {"ts": time.time(), "data": data}
    return data


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _wmo_description(code: Optional[int]) -> str:
    mapping = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail",
    }
    return mapping.get(code, "Observed conditions")


def fetch_open_meteo_weather(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> Dict[str, Any]:
    cache_key = f"weather:{lat:.2f}:{lon:.2f}"
    cached = _get_cached(cache_key, ttl_seconds=300)
    if cached:
        return cached

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m"
        f"&timezone=Asia%2FKolkata"
    )
    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(url)
        if resp.status_code == 200:
            raw = resp.json()
            cur = raw.get("current", {})
            data = {
                "available": True,
                "source": "Open-Meteo Weather API",
                "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)",
                "fetched_at": _utc_now(),
                "observation_time": cur.get("time"),
                "temperature_c": cur.get("temperature_2m"),
                "humidity_pct": cur.get("relative_humidity_2m"),
                "precipitation_mm": cur.get("precipitation"),
                "rain_mm": cur.get("rain"),
                "wind_speed_kmh": cur.get("wind_speed_10m"),
                "weather_code": cur.get("weather_code"),
                "condition": _wmo_description(cur.get("weather_code")),
                "classification": "EXTERNAL OPEN-SOURCE OBSERVATION",
            }
            return _set_cached(cache_key, data)
        return {
            "available": False,
            "source": "Open-Meteo Weather API",
            "reason": f"HTTP {resp.status_code}",
            "fetched_at": _utc_now(),
        }
    except Exception as exc:
        return {
            "available": False,
            "source": "Open-Meteo Weather API",
            "reason": f"Request failed: {type(exc).__name__}",
            "fetched_at": _utc_now(),
        }


def fetch_usgs_earthquakes(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON, radius_km: int = 1200) -> Dict[str, Any]:
    cache_key = f"usgs:{lat:.1f}:{lon:.1f}:{radius_km}"
    cached = _get_cached(cache_key, ttl_seconds=600)
    if cached:
        return cached

    start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    url = (
        f"https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson"
        f"&starttime={start_date}&latitude={lat}&longitude={lon}"
        f"&maxradiuskm={radius_km}&minmagnitude=2.5&limit=15"
    )
    try:
        with httpx.Client(timeout=7.0) as client:
            resp = client.get(url)
        if resp.status_code == 200:
            raw = resp.json()
            events = []
            for feat in raw.get("features", []):
                props = feat.get("properties", {})
                coords = feat.get("geometry", {}).get("coordinates", [None, None, None])
                if coords[0] is not None and coords[1] is not None:
                    events.append({
                        "id": feat.get("id"),
                        "title": props.get("title"),
                        "magnitude": props.get("mag"),
                        "place": props.get("place"),
                        "time_ms": props.get("time"),
                        "longitude": coords[0],
                        "latitude": coords[1],
                        "depth_km": coords[2],
                        "url": props.get("url"),
                        "source": "USGS Earthquake Hazards Program",
                    })
            data = {
                "available": True,
                "source": "USGS FDSNWS Earthquake Catalog",
                "attribution": "U.S. Geological Survey (Public Domain)",
                "fetched_at": _utc_now(),
                "radius_km": radius_km,
                "count": len(events),
                "events": events,
                "classification": "EXTERNAL OPEN-SOURCE OBSERVATION",
            }
            return _set_cached(cache_key, data)
        return {
            "available": False,
            "source": "USGS FDSNWS Earthquake Catalog",
            "reason": f"HTTP {resp.status_code}",
            "events": [],
            "fetched_at": _utc_now(),
        }
    except Exception as exc:
        return {
            "available": False,
            "source": "USGS FDSNWS Earthquake Catalog",
            "reason": f"Request failed: {type(exc).__name__}",
            "events": [],
            "fetched_at": _utc_now(),
        }


def fetch_nasa_eonet_events() -> Dict[str, Any]:
    cache_key = "nasa_eonet_open"
    cached = _get_cached(cache_key, ttl_seconds=600)
    if cached:
        return cached

    url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20"
    try:
        with httpx.Client(timeout=7.0) as client:
            resp = client.get(url)
        if resp.status_code == 200:
            raw = resp.json()
            events = []
            for ev in raw.get("events", []):
                geoms = ev.get("geometry", [])
                latest = geoms[-1] if geoms else None
                coords = latest.get("coordinates") if latest else None
                if coords and isinstance(coords, list) and len(coords) >= 2 and isinstance(coords[0], (int, float)):
                    cats = [c.get("title") for c in ev.get("categories", [])]
                    events.append({
                        "id": ev.get("id"),
                        "title": ev.get("title"),
                        "category": cats[0] if cats else "Natural Hazard",
                        "date": latest.get("date"),
                        "longitude": coords[0],
                        "latitude": coords[1],
                        "link": ev.get("link"),
                        "source": "NASA EONET v3",
                    })
            data = {
                "available": True,
                "source": "NASA Earth Observatory Natural Event Tracker (EONET v3)",
                "attribution": "NASA EOSDIS / EONET (Public Domain)",
                "fetched_at": _utc_now(),
                "count": len(events),
                "events": events,
                "classification": "EXTERNAL OPEN-SOURCE OBSERVATION",
            }
            return _set_cached(cache_key, data)
        return {
            "available": False,
            "source": "NASA EONET v3",
            "reason": f"HTTP {resp.status_code}",
            "events": [],
            "fetched_at": _utc_now(),
        }
    except Exception as exc:
        return {
            "available": False,
            "source": "NASA EONET v3",
            "reason": f"Request failed: {type(exc).__name__}",
            "events": [],
            "fetched_at": _utc_now(),
        }


def fetch_osm_emergency_infrastructure(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON, radius_m: int = 6000) -> Dict[str, Any]:
    cache_key = f"osm:{lat:.2f}:{lon:.2f}:{radius_m}"
    cached = _get_cached(cache_key, ttl_seconds=900)
    if cached:
        return cached

    overpass_query = (
        f"[out:json][timeout:8];"
        f"("
        f'node["amenity"~"hospital|fire_station|police|clinic"](around:{radius_m},{lat},{lon});'
        f'node["emergency"="shelter"](around:{radius_m},{lat},{lon});'
        f");"
        f"out body 35;"
    )
    try:
        with httpx.Client(timeout=8.5) as client:
            resp = client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": overpass_query},
                headers={"User-Agent": "ATLAS-Disaster-Response/2.0"},
            )
        if resp.status_code == 200:
            raw = resp.json()
            pois = []
            for el in raw.get("elements", []):
                tags = el.get("tags", {})
                name = tags.get("name")
                if not name:
                    continue
                pois.append({
                    "id": f"OSM-{el.get('id')}",
                    "name": name,
                    "amenity": tags.get("amenity") or tags.get("emergency") or "facility",
                    "latitude": el.get("lat"),
                    "longitude": el.get("lon"),
                    "source": "OpenStreetMap Overpass API",
                })
            data = {
                "available": True,
                "source": "OpenStreetMap (Overpass API)",
                "attribution": "© OpenStreetMap contributors (ODbL)",
                "fetched_at": _utc_now(),
                "radius_m": radius_m,
                "count": len(pois),
                "pois": pois,
                "classification": "EXTERNAL OPEN-SOURCE GEOGRAPHIC DATA",
            }
            return _set_cached(cache_key, data)
        return {
            "available": False,
            "source": "OpenStreetMap (Overpass API)",
            "reason": f"Overpass API returned HTTP {resp.status_code} (rate-limited or busy).",
            "pois": [],
            "fetched_at": _utc_now(),
        }
    except Exception as exc:
        return {
            "available": False,
            "source": "OpenStreetMap (Overpass API)",
            "reason": f"Request failed: {type(exc).__name__}",
            "pois": [],
            "fetched_at": _utc_now(),
        }


def get_imagery_layers_catalog() -> Dict[str, Any]:
    # Use 2 days ago UTC for NASA GIBS VIIRS to ensure complete daily global tile availability
    gibs_date = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
    return {
        "fetched_at": _utc_now(),
        "layers": [
            {
                "id": "satellite",
                "name": "Esri World Imagery",
                "layer_type": "Static High-Res Composite Basemap",
                "source": "Esri, Maxar, Earthstar Geographics",
                "acquisition_date": "Static multi-date composite (not live)",
                "resolution": "0.3m – 1m",
                "freshness": "Static Reference",
                "tile_url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                "max_zoom": 19,
                "attribution": "© Esri, Maxar, Earthstar Geographics",
            },
            {
                "id": "gibs-viirs",
                "name": "NASA GIBS VIIRS True Color",
                "layer_type": "Daily Orbital Satellite Imagery",
                "source": "NASA EOSDIS GIBS (Suomi NPP / VIIRS)",
                "acquisition_date": gibs_date,
                "resolution": "375m (regional overview, max zoom 9)",
                "freshness": f"Daily ({gibs_date})",
                "tile_url": f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{gibs_date}/GoogleMapsCompatible_Level9/{{z}}/{{y}}/{{x}}.jpg",
                "max_zoom": 9,
                "attribution": "NASA EOSDIS Global Imagery Browse Services (GIBS)",
            },
            {
                "id": "street",
                "name": "OpenStreetMap Standard",
                "layer_type": "Open Vector-Raster Road & Building Map",
                "source": "OpenStreetMap",
                "acquisition_date": "Community-maintained live",
                "resolution": "Street-level",
                "freshness": "Continuous",
                "tile_url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                "max_zoom": 19,
                "attribution": "© OpenStreetMap contributors",
            },
            {
                "id": "terrain",
                "name": "OpenTopoMap Terrain",
                "layer_type": "Elevation & Topographic Contours",
                "source": "OpenTopoMap / SRTM / OSM",
                "acquisition_date": "SRTM Elevation + OSM",
                "resolution": "30m elevation contours",
                "freshness": "Static Elevation + OSM",
                "tile_url": "https://tile.opentopomap.org/{z}/{x}/{y}.png",
                "max_zoom": 17,
                "attribution": "© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors",
            },
        ],
    }


def get_gibs_layers_catalog(date_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Curated NASA Worldview / EOSDIS GIBS WMTS EPSG:3857 layers for disaster intelligence.
    Uses GoogleMapsCompatible tiling compatible with MapLibre GL.
    """
    default_date = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
    chosen_date = date_str or default_date
    return {
        "date": chosen_date,
        "default_date": default_date,
        "fetched_at": _utc_now(),
        "attribution": "NASA EOSDIS Global Imagery Browse Services (GIBS)",
        "layers": [
            {
                "id": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
                "name": "VIIRS SNPP True Color",
                "category": "Natural Color",
                "is_overlay": False,
                "max_zoom": 9,
                "resolution": "250m–375m",
                "tile_url": f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{chosen_date}/GoogleMapsCompatible_Level9/{{z}}/{{y}}/{{x}}.jpg",
                "description": "Daily orbital natural-color reflectance (Suomi NPP).",
            },
            {
                "id": "MODIS_Terra_CorrectedReflectance_TrueColor",
                "name": "MODIS Terra True Color",
                "category": "Natural Color",
                "is_overlay": False,
                "max_zoom": 9,
                "resolution": "250m",
                "tile_url": f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{chosen_date}/GoogleMapsCompatible_Level9/{{z}}/{{y}}/{{x}}.jpg",
                "description": "Morning-pass natural-color reflectance (Terra MODIS).",
            },
            {
                "id": "MODIS_Terra_CorrectedReflectance_Bands721",
                "name": "MODIS Flood & Burn (Bands 7-2-1)",
                "category": "Flood & Burn",
                "is_overlay": False,
                "max_zoom": 9,
                "resolution": "250m",
                "tile_url": f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_Bands721/default/{chosen_date}/GoogleMapsCompatible_Level9/{{z}}/{{y}}/{{x}}.jpg",
                "description": "False-color SWIR/NIR: standing floodwater appears dark blue/black, vegetation bright green.",
            },
            {
                "id": "VIIRS_SNPP_Thermal_Anomalies_375m_All",
                "name": "VIIRS Fire & Thermal Anomalies",
                "category": "Fire & Smoke",
                "is_overlay": True,
                "max_zoom": 8,
                "resolution": "375m",
                "tile_url": f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Thermal_Anomalies_375m_All/default/{chosen_date}/GoogleMapsCompatible_Level8/{{z}}/{{y}}/{{x}}.png",
                "description": "Active fire & thermal anomaly detections overlay.",
            },
            {
                "id": "IMERG_Precipitation_Rate",
                "name": "GPM IMERG Precipitation Rate",
                "category": "Atmospheric",
                "is_overlay": True,
                "max_zoom": 6,
                "resolution": "10km",
                "tile_url": f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{chosen_date}/GoogleMapsCompatible_Level6/{{z}}/{{y}}/{{x}}.png",
                "description": "Global satellite precipitation rate overlay.",
            },
        ],
    }


def fetch_sentinel2_stac_scenes(
    lat: float = DEFAULT_LAT,
    lon: float = DEFAULT_LON,
    max_cloud: float = 100.0,
    limit: int = 6,
) -> Dict[str, Any]:
    """
    Queries Element84 Earth Search public STAC API for real Sentinel-2 L2A scenes.
    No API key required; returns actual scene metadata, cloud cover, and EO Browser handoff links.
    """
    cache_key = f"stac_s2:{lat:.2f}:{lon:.2f}:{max_cloud}:{limit}"
    cached = _get_cached(cache_key, ttl_seconds=900)
    if cached:
        return cached

    url = "https://earth-search.aws.element84.com/v1/search"
    payload: Dict[str, Any] = {
        "collections": ["sentinel-2-l2a"],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "limit": limit,
    }
    if max_cloud < 100.0:
        payload["query"] = {"eo:cloud_cover": {"lte": max_cloud}}

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(url, json=payload)
        if resp.status_code == 200:
            raw = resp.json()
            scenes = []
            for feat in raw.get("features", []):
                props = feat.get("properties", {})
                assets = feat.get("assets", {})
                dt = props.get("datetime", "")
                date_only = dt[:10] if dt else ""
                thumb = (assets.get("thumbnail") or {}).get("href")
                eo_url = (
                    f"https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat={lat}&lng={lon}"
                    f"&themeId=DEFAULT-THEME&datasetId=S2L2A"
                    + (f"&fromTime={date_only}T00:00:00.000Z&toTime={date_only}T23:59:59.999Z" if date_only else "")
                )
                scenes.append({
                    "id": feat.get("id"),
                    "collection": feat.get("collection"),
                    "datetime": dt,
                    "date": date_only,
                    "cloud_cover": round(float(props.get("eo:cloud_cover", 0.0)), 1),
                    "platform": props.get("platform", "sentinel-2"),
                    "thumbnail": thumb,
                    "eo_browser_url": eo_url,
                })
            data = {
                "available": True,
                "source": "Element84 Earth Search STAC (AWS Open Data Sentinel-2 L2A)",
                "attribution": "Copernicus Sentinel data (ESA) via Element84 Earth Search",
                "fetched_at": _utc_now(),
                "count": len(scenes),
                "scenes": scenes,
            }
            return _set_cached(cache_key, data)
        return {
            "available": False,
            "source": "Element84 Earth Search STAC",
            "reason": f"HTTP {resp.status_code}",
            "scenes": [],
            "fetched_at": _utc_now(),
        }
    except Exception as exc:
        return {
            "available": False,
            "source": "Element84 Earth Search STAC",
            "reason": f"Request failed: {type(exc).__name__}",
            "scenes": [],
            "fetched_at": _utc_now(),
        }

