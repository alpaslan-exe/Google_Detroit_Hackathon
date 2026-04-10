import os
import json

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from .pipeline import full_pipeline, geocode
    from .scoring import compute_safety_score, load_blight
except ImportError:
    from pipeline import full_pipeline, geocode
    from scoring import compute_safety_score, load_blight

load_dotenv()

app = Flask(__name__)
CORS(app)

BLIGHT_CSV = os.path.join(os.path.dirname(__file__), "data", "blight_violations.csv")
CRIME_POINTS_PATH = os.path.join(os.path.dirname(__file__), "data", "crime_points.json")
print(f"[startup] loading blight from {BLIGHT_CSV} ...")
blight_df = load_blight(BLIGHT_CSV)
print(f"[startup] loaded {len(blight_df):,} blight records")


@app.route("/")
def index():
    return jsonify({"status": "ok", "service": "detroit-safelease-backend"})


@app.route("/api/score")
def api_score():
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat and lng query params required (floats)"}), 400
    return jsonify(compute_safety_score(blight_df, lat, lng))


@app.route("/api/geocode")
def api_geocode():
    address = request.args.get("address", "")
    if not address.strip():
        return jsonify({"error": "address query param required"}), 400

    try:
        return jsonify(geocode(address))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except requests.RequestException as exc:
        return jsonify({"error": f"geocoding request failed: {exc}"}), 502


@app.route("/api/score_by_address")
def api_score_by_address():
    address = request.args.get("address", "")
    if not address.strip():
        return jsonify({"error": "address query param required"}), 400

    try:
        return jsonify(full_pipeline(address, blight_df))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except requests.RequestException as exc:
        return jsonify({"error": f"upstream request failed: {exc}"}), 502


@app.route("/api/map/crime")
def api_map_crime():
    if not os.path.exists(CRIME_POINTS_PATH):
        return jsonify({"error": "crime_points.json not found - run pre_cache.py first"}), 503

    with open(CRIME_POINTS_PATH) as f:
        payload = json.load(f)

    features = payload.get("features", [])
    filtered = _filter_features_by_bbox(
        features,
        request.args.get("minLat"),
        request.args.get("maxLat"),
        request.args.get("minLng"),
        request.args.get("maxLng"),
    )

    return jsonify(
        {
            "layer": "crime",
            "cached_at": payload.get("cached_at"),
            "feature_count": len(filtered),
            "features": filtered,
        }
    )


def _filter_features_by_bbox(features, min_lat, max_lat, min_lng, max_lng):
    if None in (min_lat, max_lat, min_lng, max_lng):
        return features

    try:
        min_lat = float(min_lat)
        max_lat = float(max_lat)
        min_lng = float(min_lng)
        max_lng = float(max_lng)
    except ValueError:
        return features

    return [
        feature
        for feature in features
        if min_lat <= feature.get("lat", 0) <= max_lat
        and min_lng <= feature.get("lng", 0) <= max_lng
    ]


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
