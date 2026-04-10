# Handoff to P2 — Backend / Server

The scoring engine is live on `main`. This doc is everything you need to
build your layer (geocoding + UMich LLM explanation + address-based route)
on top of it.

## 1. Get it running (5 minutes)

```bash
git pull origin main
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# One-time: downloads ~534 MB blight CSV + refreshes crime cache. ~2 min.
python pre_cache.py

# Start the server
python app.py
```

Expected startup output:
```
[startup] loaded 27,531 blight records
 * Running on http://127.0.0.1:8000
```

**Verify it works:**
```bash
curl 'http://localhost:8000/api/score?lat=42.437448&lng=-83.245584'
# Expect: score ~87.8, label "LOW RISK"
```

**Note on ports:** macOS AirPlay squats 5000/5001, so we run on **8000**.

## 2. Your contract with P1 (do not change this)

```
GET http://localhost:8000/api/score?lat=<float>&lng=<float>
→ {
    "score": 87.8,
    "label": "LOW RISK",          // "LOW RISK" | "MODERATE RISK" | "HIGH RISK"
    "crime_count": 41,            // int, 500m / last 90 days
    "crime_score": 33.9,          // float, 0-40
    "blight_count": 6,            // int, 300m, active unpaid Responsible tickets
    "blight_score": 24.0,         // float, 0-30
    "is_compliant": true,         // bool, BSEED rental registration within 100m
    "compliance_score": 30        // int, 0 or 30
  }
```

Errors return `400` with `{"error": "..."}`. CORS is already enabled for all origins.

## 3. What you're building

Two new routes on top of the one above:

### `GET /api/geocode?address=<string>`
- Calls Nominatim (OpenStreetMap): `https://nominatim.openstreetmap.org/search`
- **Must send `User-Agent: safelease-hackathon-2026` header** or Nominatim blocks you
- Must append `, Detroit, MI` to queries that don't already contain it
- Returns `{address, lat, lng}` or `404 {error}`
- 1 req/sec rate limit — don't loop it

### `GET /api/score_by_address?address=<string>`
- Geocode the address → call `compute_safety_score()` directly (don't HTTP self-call)
  → feed result to the UMich hackathon LLM API → return combined JSON
- Response:
  ```json
  {
    "address": "19935 Patton St, Detroit, MI",
    "lat": 42.437448,
    "lng": -83.245584,
    "...all scoring fields...": "...",
    "explanation": "Your neighborhood has a low risk..."
  }
  ```

## 4. Starter code — `backend/pipeline.py`

```python
import os
import requests
from openai import OpenAI
from scoring import compute_safety_score

NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "safelease-hackathon-2026"}
DEFAULT_UMICH_MODEL = "@azure-1/gpt-5.2"

_client = None
def _umich_client():
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.getenv("UMICH_API_KEY"),
            base_url=os.getenv("UMICH_BASE_URL"),
        )
    return _client


def geocode(address):
    """Returns (lat, lng). Raises ValueError if not found."""
    if "detroit" not in address.lower():
        address = f"{address}, Detroit, MI"
    r = requests.get(
        NOMINATIM,
        params={"q": address, "format": "json", "limit": 1},
        headers=HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    results = r.json()
    if not results:
        raise ValueError(f"address not found: {address}")
    return float(results[0]["lat"]), float(results[0]["lon"])


def generate_explanation(address, score_data):
    # Careful phrasing — see "Known caveats" in README.md
    compliance_status = (
        "REGISTERED with BSEED"
        if score_data["is_compliant"]
        else "no BSEED rental registration found nearby - worth verifying directly"
    )
    prompt = f"""You are a tenant rights advisor in Detroit, Michigan.
A tenant has searched an address and received this safety data:

Address: {address}
Overall safety score: {score_data['score']} / 100 ({score_data['label']})
Crime incidents nearby (500m, last 90 days): {score_data['crime_count']}
Blight violations in the area (300m): {score_data['blight_count']}
Rental compliance status: {compliance_status}

Write 3 sentences in plain English:
1. What this score means for their safety
2. The most important thing to be aware of
3. One specific action they can take right now (verify the Certificate of
   Compliance, check with BSEED, etc.)

Do NOT assert the landlord is operating illegally - that requires the tenant
to verify the Certificate of Compliance themselves."""
    response = _umich_client().responses.create(
        model=os.getenv("UMICH_MODEL", DEFAULT_UMICH_MODEL),
        instructions="You are a helpful assistant.",
        input=prompt,
    )
    return response.output_text


def full_pipeline(address, blight_df):
    lat, lng = geocode(address)
    score_data = compute_safety_score(blight_df, lat, lng)
    explanation = generate_explanation(address, score_data)
    return {
        "address": address,
        "lat": lat,
        "lng": lng,
        **score_data,
        "explanation": explanation,
    }
```

## 5. Add the routes to `backend/app.py`

```python
from pipeline import geocode, full_pipeline

@app.route("/api/geocode")
def api_geocode():
    address = request.args.get("address", "")
    if not address:
        return jsonify({"error": "address query param required"}), 400
    try:
        lat, lng = geocode(address)
        return jsonify({"address": address, "lat": lat, "lng": lng})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

@app.route("/api/score_by_address")
def api_score_by_address():
    address = request.args.get("address", "")
    if not address:
        return jsonify({"error": "address query param required"}), 400
    try:
        return jsonify(full_pipeline(address, blight_df))
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
```

## 6. Put your UMich API credentials in `.env`

```bash
# Edit backend/.env
UMICH_API_KEY=your_api_key_here
UMICH_BASE_URL=https://apiv2.umgpt.umich.edu/v1
UMICH_MODEL=@azure-1/gpt-5.2
```

`.env` is gitignored — do not commit the key.

## 7. Test end-to-end

```bash
# Restart the server
python app.py

# In another terminal:
curl 'http://localhost:8000/api/geocode?address=1234+Woodward+Ave'
curl 'http://localhost:8000/api/score_by_address?address=19935+Patton+St'
```

The second should return a full JSON with `score`, `label`, all counts, AND
a 3-sentence `explanation` paragraph.

## 8. Hand off to frontend (P3 / P4)

Tell them the contract:
```
GET /api/score_by_address?address=<string>
→ { address, lat, lng, score, label, crime_count, crime_score,
    blight_count, blight_score, is_compliant, compliance_score,
    explanation }
```

CORS is already on; React can fetch directly.

## Critical gotchas

1. **Do not label `is_compliant: false` as "landlord is illegal"** in the
   model prompt. BSEED registration is a relative signal, not a legal
   verdict. A `false` result can also mean the address just isn't a rental
   (downtown commercial, vacant lot). See `README.md` → "Known caveats".

2. **Pitch stat is "120k+ rentals, ~8% fully compliant"**, NOT our dataset's
   raw count. Do not hardcode 4,573 anywhere public-facing.

3. **Nominatim requires the `User-Agent` header** — without it you get
   rate-limited or blocked outright.

4. **Nominatim is 1 req/sec** — fine for demo, do not loop it.

5. **If ArcGIS goes down mid-demo**, the scoring engine already falls back
   to `crime_cache.json` (committed to repo). You do not need to handle
   that — rely on it.

6. **macOS port conflict**: we're on **8000**, not 5000 like the Build
   Guide says. AirPlay Receiver squats 5000.

## Reading list before you start coding

- `backend/README.md` — full API contract, calibration notes, data sources,
  known caveats
- `backend/scoring.py` — if you want to understand what `compute_safety_score()`
  actually does
- Build Guide §2.4 (Nominatim), §2.5 (LLM prompt) — mostly valid, just use
  the corrected compliance phrasing above

Ping P1 if anything doesn't work.
