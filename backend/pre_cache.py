"""
Pre-cache data before the hackathon so we don't depend on live APIs during demo.
Run: python pre_cache.py
Produces:
  - data/blight_violations.csv
  - data/crime_cache.json
  - data/crime_points.json
"""
import io
import json
import os
import sys
import zipfile
from datetime import datetime, timedelta

import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

BLIGHT_ZIP_URL = "https://apis.detroitmi.gov/data/blight_violations.zip"

CRIME_SERVICE = (
    "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/"
    "RMS_Crime_Incidents/FeatureServer/0/query"
)

RENTAL_SERVICE = (
    "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/"
    "Rental_Registrations_(Combined)/FeatureServer/0/query"
)

DEMO_POINTS = [
    ("downtown", 42.3314, -83.0458),
    ("midtown", 42.3519, -83.0664),
    ("eastside", 42.3682, -82.9929),
]

CRIME_POINTS_PATH = os.path.join(DATA_DIR, "crime_points.json")


def download_blight():
    out_csv = os.path.join(DATA_DIR, "blight_violations.csv")
    if os.path.exists(out_csv):
        print(f"[blight] already exists at {out_csv}, skipping")
        return
    print(f"[blight] downloading {BLIGHT_ZIP_URL} ...")
    r = requests.get(BLIGHT_ZIP_URL, timeout=180)
    r.raise_for_status()
    print(f"[blight] got {len(r.content)} bytes, extracting ...")
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names = z.namelist()
        print(f"[blight] zip contains: {names}")
        z.extractall(DATA_DIR)
        if not os.path.exists(out_csv):
            csvs = [n for n in names if n.lower().endswith(".csv")]
            if not csvs:
                raise RuntimeError("no csv found in blight zip")
            extracted = os.path.join(DATA_DIR, csvs[0])
            os.rename(extracted, out_csv)
    print(f"[blight] done: {out_csv}")


def fetch_crime(lat, lng, radius=500, days=90):
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")
    params = {
        "where": f"incident_occurred_at >= TIMESTAMP '{cutoff}'",
        "geometry": json.dumps({"x": lng, "y": lat}),
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": radius,
        "units": "esriSRUnit_Meter",
        "outFields": "offense_category,incident_occurred_at",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }
    r = requests.get(CRIME_SERVICE, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_crime_ids(days=90):
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")
    params = {
        "where": f"incident_occurred_at >= TIMESTAMP '{cutoff}'",
        "returnIdsOnly": "true",
        "f": "json",
    }
    r = requests.get(CRIME_SERVICE, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def fetch_crime_features_by_ids(object_ids):
    data = {
        "objectIds": ",".join(str(object_id) for object_id in object_ids),
        "outFields": "offense_category,incident_occurred_at",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }
    r = requests.post(CRIME_SERVICE, data=data, timeout=60)
    r.raise_for_status()
    return r.json()


def cache_crime():
    out = os.path.join(DATA_DIR, "crime_cache.json")
    cache = {}
    for name, lat, lng in DEMO_POINTS:
        print(f"[crime] querying {name} ({lat}, {lng}) ...")
        try:
            data = fetch_crime(lat, lng)
            n = len(data.get("features", []))
            print(f"[crime] {name}: {n} features (last 90 days, 500m)")
            cache[name] = {"lat": lat, "lng": lng, "count": n, "data": data}
        except Exception as e:
            print(f"[crime] {name} FAILED: {e}", file=sys.stderr)
            cache[name] = {"lat": lat, "lng": lng, "count": 0, "error": str(e)}
    with open(out, "w") as f:
        json.dump(cache, f)
    print(f"[crime] done: {out}")


def cache_crime_points(batch_size=250):
    print("[crime-points] fetching recent incident ids for the last 90 days ...")
    payload = fetch_crime_ids(days=90)
    object_ids = sorted(payload.get("objectIds", []))
    total = len(object_ids)
    print(f"[crime-points] found {total:,} incidents")

    points = []
    for start in range(0, total, batch_size):
        batch = object_ids[start : start + batch_size]
        print(
            f"[crime-points] fetching batch {start // batch_size + 1} "
            f"({start + 1:,}-{min(start + len(batch), total):,} of {total:,}) ..."
        )
        data = fetch_crime_features_by_ids(batch)
        for feature in data.get("features", []):
            geometry = feature.get("geometry") or {}
            attributes = feature.get("attributes") or {}
            x = geometry.get("x")
            y = geometry.get("y")
            if x is None or y is None:
                continue
            points.append(
                {
                    "lat": y,
                    "lng": x,
                    "weight": 1,
                    "offense_category": attributes.get("offense_category"),
                    "incident_occurred_at": attributes.get("incident_occurred_at"),
                }
            )

    output = {
        "cached_at": datetime.utcnow().isoformat() + "Z",
        "feature_count": len(points),
        "features": points,
    }
    with open(CRIME_POINTS_PATH, "w") as f:
        json.dump(output, f)
    print(f"[crime-points] done: {CRIME_POINTS_PATH} ({len(points):,} points)")


if __name__ == "__main__":
    download_blight()
    cache_crime()
    cache_crime_points()
