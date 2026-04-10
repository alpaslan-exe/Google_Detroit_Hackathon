import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from .pipeline import full_pipeline, geocode, chat_with_context
    from .scoring import compute_safety_score, load_blight
except ImportError:
    from pipeline import full_pipeline, geocode, chat_with_context
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
    return jsonify({"status": "ok", "service": "staysignal-backend"})


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
    data = request.get_json(force=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message required"}), 400

    address = data.get("address", "")
    score_data = data.get("score_data", {})
    history = data.get("history", [])

    try:
        reply = chat_with_context(message, address, score_data, history)
        return jsonify({"reply": reply})
    except Exception:
        return jsonify({"error": "An error occurred processing your request"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
