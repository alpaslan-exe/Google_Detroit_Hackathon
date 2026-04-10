import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
