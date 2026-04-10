import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from .pipeline import chat_followup, full_pipeline, geocode
    from .scoring import compute_safety_score, load_blight
except ImportError:
    from pipeline import chat_followup, full_pipeline, geocode
    from scoring import compute_safety_score, load_blight

load_dotenv()

app = Flask(__name__)
CORS(app)

BLIGHT_CSV = os.path.join(os.path.dirname(__file__), "data", "blight_violations.csv")
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


@app.route("/api/chat", methods=["POST"])
def api_chat():
    body = request.get_json(silent=True) or {}
    address = (body.get("address") or "").strip()
    message = (body.get("message") or "").strip()

    if not address:
        return jsonify({"error": "address field required"}), 400
    if not message:
        return jsonify({"error": "message field required"}), 400

    reply, found = chat_followup(address, message)
    if not found:
        return jsonify({"error": "No prior analysis found for this address. Search the address first to generate a safety report."}), 404
    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
