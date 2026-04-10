"""
StaySignal scoring engine.

Public API:
    load_blight(csv_path) -> pandas.DataFrame
    haversine(lat1, lon1, lat2, lon2) -> meters
    count_crimes_nearby(lat, lng, radius=500) -> int
    count_blight_nearby(blight_df, lat, lng, radius=300) -> int
    check_rental_compliance(lat, lng, radius=100) -> bool
    compute_safety_score(blight_df, lat, lng) -> dict
"""
import json
import os
from datetime import datetime, timedelta
from math import atan2, cos, radians, sin, sqrt

import numpy as np
import pandas as pd
import requests

EARTH_RADIUS_M = 6_371_000

CRIME_SERVICE = (
    "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/"
    "RMS_Crime_Incidents/FeatureServer/0/query"
)
RENTAL_SERVICE = (
    "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/"
    "Rental_Registrations_(Combined)/FeatureServer/0/query"
)

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_CRIME_CACHE_PATH = os.path.join(_DATA_DIR, "crime_cache.json")

# Loaded lazily the first time count_crimes_nearby falls back to cache.
_crime_cache = None


def load_blight(csv_path, years_back=2):
    """
    Load the blight CSV and pre-filter to "meaningful" violations:
      - DISPOSITION starts with 'Responsible' (actually found guilty)
      - TICKET_ISSUED_DATE within the last `years_back` years
      - AMT_BALANCE_DUE > 0 (still owing money -> unresolved)
      - non-null coordinates
    This throws out ~97% of the 816k raw rows. What's left is an
    "active problems" signal that's useful for tenant safety.
    """
    df = pd.read_csv(
        csv_path,
        usecols=[
            "LATITUDE",
            "LONGITUDE",
            "DISPOSITION",
            "TICKET_ISSUED_DATE",
            "AMT_BALANCE_DUE",
        ],
        low_memory=False,
    )
    df = df.dropna(subset=["LATITUDE", "LONGITUDE"])
    df["TICKET_ISSUED_DATE"] = pd.to_datetime(
        df["TICKET_ISSUED_DATE"], errors="coerce", utc=True
    )
    cutoff = pd.Timestamp.utcnow() - pd.DateOffset(years=years_back)
    df = df[
        df["DISPOSITION"].fillna("").str.startswith("Responsible")
        & (df["TICKET_ISSUED_DATE"] >= cutoff)
        & (df["AMT_BALANCE_DUE"].fillna(0) > 0)
    ]
    df = df.rename(columns={"LATITUDE": "lat", "LONGITUDE": "lon"})
    return df[["lat", "lon"]].reset_index(drop=True)


def haversine(lat1, lon1, lat2, lon2):
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return EARTH_RADIUS_M * 2 * atan2(sqrt(a), sqrt(1 - a))


def _haversine_vec(lat1, lon1, lat2, lon2):
    """Vectorized haversine: lat2/lon2 are numpy arrays."""
    lat1_r = np.radians(lat1)
    lon1_r = np.radians(lon1)
    lat2_r = np.radians(lat2)
    lon2_r = np.radians(lon2)
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
    return EARTH_RADIUS_M * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


def _load_crime_cache():
    global _crime_cache
    if _crime_cache is None and os.path.exists(_CRIME_CACHE_PATH):
        with open(_CRIME_CACHE_PATH) as f:
            _crime_cache = json.load(f)
    return _crime_cache or {}


def count_crimes_nearby(lat, lng, radius=500, days=90):
    """
    Live ArcGIS query for crimes within `radius` meters in the last `days` days.
    On failure, fall back to the pre-cached count of the nearest demo point.
    """
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")
    params = {
        "where": f"incident_occurred_at >= TIMESTAMP '{cutoff}'",
        "geometry": json.dumps({"x": lng, "y": lat}),
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": radius,
        "units": "esriSRUnit_Meter",
        "returnCountOnly": "true",
        "f": "json",
    }
    try:
        r = requests.get(CRIME_SERVICE, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if "count" in data:
            return int(data["count"])
    except Exception as e:
        print(f"[crime] live query failed, using cache: {e}")

    # Fallback: nearest demo point in cache
    cache = _load_crime_cache()
    if not cache:
        return 0
    nearest = min(
        cache.values(),
        key=lambda p: haversine(lat, lng, p["lat"], p["lng"]),
    )
    return int(nearest.get("count", 0))


def count_blight_nearby(blight_df, lat, lng, radius=300):
    """
    Count blight violations within `radius` meters of (lat, lng).
    Uses a bounding-box pre-filter + vectorized haversine for speed.
    """
    # Rough bbox: 0.005 deg is ~555m at lat 42 — safe over-select for 300m.
    delta = max(0.005, radius / 80_000)
    bbox = blight_df[
        (blight_df["lat"].between(lat - delta, lat + delta))
        & (blight_df["lon"].between(lng - delta, lng + delta))
    ]
    if bbox.empty:
        return 0
    distances = _haversine_vec(lat, lng, bbox["lat"].to_numpy(), bbox["lon"].to_numpy())
    return int((distances < radius).sum())


def check_rental_compliance(lat, lng, radius=100):
    """
    True if at least one Rental Registrations record exists within `radius` meters.
    The dataset only contains registered rentals, so presence = compliant.
    ArcGIS failure -> False (assume non-compliant is the safer default for tenants).
    """
    params = {
        "where": "1=1",
        "geometry": json.dumps({"x": lng, "y": lat}),
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": radius,
        "units": "esriSRUnit_Meter",
        "returnCountOnly": "true",
        "f": "json",
    }
    try:
        r = requests.get(RENTAL_SERVICE, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        return int(data.get("count", 0)) > 0
    except Exception as e:
        print(f"[rental] live query failed: {e}")
        return False


def compute_safety_score(blight_df, lat, lng):
    """
    Combine three components into a 0-100 safety score.

    Curves were calibrated against 8 real Detroit points (see scoring notes
    in the PR / README). The slopes in the Build Guide §3 were far too steep —
    6 blight tickets in 300m is common in residential Detroit, and 20+ crimes
    in 500m/90d is the norm, so the original formulas pinned every address to
    HIGH RISK. These softer curves let the three components actually separate
    neighborhoods from each other.
    """
    crime_count = count_crimes_nearby(lat, lng, radius=500)
    crime_score = max(0.0, 70 - crime_count * 0.2625)

    blight_count = count_blight_nearby(blight_df, lat, lng, radius=300)
    blight_score = max(0.0, 15 - blight_count * 0.5)

    is_compliant = check_rental_compliance(lat, lng, radius=100)
    compliance_score = 15 if is_compliant else 0

    total = round(crime_score + blight_score + compliance_score, 1)
    if total >= 70:
        label = "LOW RISK"
    elif total >= 45:
        label = "MODERATE RISK"
    else:
        label = "HIGH RISK"

    return {
        "score": total,
        "label": label,
        "crime_count": crime_count,
        "crime_score": round(crime_score, 1),
        "blight_count": blight_count,
        "blight_score": round(blight_score, 1),
        "is_compliant": is_compliant,
        "compliance_score": compliance_score,
    }
