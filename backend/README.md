# StaySignal Backend — Scoring Engine + Address Pipeline

Flask service that turns a Detroit coordinate into a 0–100 safety score,
combining live crime data, locally-cached blight violations, and live rental
registration lookups.

The backend now exposes two layers:

- P1 scoring route: `GET /api/score?lat=<float>&lng=<float>`
- P2 address pipeline: `GET /api/geocode?address=<string>` and
  `GET /api/score_by_address?address=<string>`

## Quick start

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# One-time: download blight CSV (~128 MB) + cache crime data for 3 demo points.
# Must run before starting the server, or app.py will fail to load blight data.
python pre_cache.py

# Optional: create .env for the UMich hackathon LLM layer
cp .env.example .env

# Start the server on :8000  (macOS 5000/5001 are taken by AirPlay/other)
python app.py
```

If you want `score_by_address` to return an LLM explanation instead of the
local fallback paragraph, put these values in `.env`:

```bash
UMICH_API_KEY=...
UMICH_BASE_URL=https://apiv2.umgpt.umich.edu/v1
UMICH_MODEL=@azure-1/gpt-5.2
```

## API

### `GET /api/score?lat=<float>&lng=<float>`

```bash
curl 'http://localhost:8000/api/score?lat=42.437448&lng=-83.245584'
```

Response:
```json
{
  "score": 86.2,
  "label": "LOW RISK",
  "crime_count": 41,
  "crime_score": 59.2,
  "blight_count": 6,
  "blight_score": 12.0,
  "is_compliant": true,
  "compliance_score": 15
}
```

| field              | type   | meaning                                                                 |
|--------------------|--------|-------------------------------------------------------------------------|
| `score`            | float  | total 0–100                                                             |
| `label`            | string | `"LOW RISK"` ≥70 · `"MODERATE RISK"` ≥45 · `"HIGH RISK"` otherwise      |
| `crime_count`      | int    | incidents within **500m** in the **last 90 days** (live ArcGIS)         |
| `crime_score`      | float  | 0–70                                                                    |
| `blight_count`     | int    | active unpaid "Responsible" blight tickets within **300m** (local CSV)  |
| `blight_score`     | float  | 0–15                                                                    |
| `is_compliant`     | bool   | any BSEED rental registration found within **100m** (live ArcGIS)       |
| `compliance_score` | int    | `15` if compliant, `0` otherwise                                        |

**400** — `{"error": "lat and lng query params required (floats)"}`

CORS is enabled for all origins.

### `GET /api/geocode?address=<string>`

```bash
curl 'http://localhost:8000/api/geocode?address=1234+Woodward+Ave'
```

Response:
```json
{
  "address": "1234 Woodward Ave, Detroit, MI 48226, USA",
  "lat": 42.3314,
  "lng": -83.0458
}
```

### `GET /api/score_by_address?address=<string>`

```bash
curl 'http://localhost:8000/api/score_by_address?address=19935+Patton+St'
```

Response shape:
```json
{
  "address": "19935 Patton St, Detroit, MI 48219, USA",
  "lat": 42.437448,
  "lng": -83.245584,
  "score": 86.2,
  "label": "LOW RISK",
  "crime_count": 41,
  "crime_score": 59.2,
  "blight_count": 6,
  "blight_score": 12.0,
  "is_compliant": true,
  "compliance_score": 15,
  "explanation": "..."
}
```

Notes:

- The backend appends `Detroit, MI` if the query does not already include it.
- `explanation` comes from the UMich hackathon LLM API when `.env` is configured.
- If the UMich API is unavailable, the backend returns a local fallback paragraph
  so the demo still works.

## Scoring formula (and why it differs from the Build Guide)

```python
crime_score      = max(0, 70 - crime_count  * 0.2625)
blight_score     = max(0, 15 - blight_count * 0.5)
compliance_score = 15 if is_compliant else 0
total            = crime_score + blight_score + compliance_score
```

The Build Guide §3 specified steeper slopes (`40 - count*2`, `30 - count*5`),
but testing against 8 real Detroit coordinates showed **every** address in the
city would land in HIGH RISK — Detroit residential neighborhoods routinely have
30–60 crimes in 500m over 90 days, and a handful of historical blight tickets
within 300m. The curves were recalibrated so the three risk tiers actually
separate meaningful categories.

The component weights were later rebalanced to **70 / 15 / 15** (crime / blight /
compliance) so the dominant environmental signal — recent crime within walking
distance — carries most of the score, and blight / registration act as
secondary modifiers. The per-component decay coefficients were scaled in
proportion, so the shape of each curve is preserved.

| sample                | crime | blight | compliant | score | label          |
|-----------------------|-------|--------|-----------|-------|----------------|
| 19935 PATTON (residential, registered) | 41  | 6   | ✓ | 86.2 | LOW RISK       |
| 3009 NEWPORT                           | 12  | 22  | ✓ | 85.9 | LOW RISK       |
| 14400 PATTON (registered, blighted area) | 51 | 70 | ✓ | 71.6 | LOW RISK      |
| eastside (42.3682,-82.9929, no rental reg) | 14 | 5 | ✗ | 78.8 | LOW RISK      |
| midtown (42.3519,-83.0664)             | 171 | 6  | ✗ | 37.1 | HIGH RISK     |
| downtown (42.3314,-83.0458)            | 315 | 3  | ✗ | 13.5 | HIGH RISK     |

> **Caveat:** with the 70/15/15 weighting, the MODERATE tier collapses for these
> calibration points — all the previously-MODERATE samples now land in LOW RISK
> because crime is the dominant signal and these addresses all have relatively
> low crime counts. The label thresholds (`70` / `45`) were not retuned; if you
> want MODERATE to be meaningful under the new weights, the thresholds or the
> crime decay coefficient need another calibration pass.

## Blight CSV pre-filter

`load_blight()` drops ~97% of the 816 k rows on startup, keeping only:

- `DISPOSITION` starts with `"Responsible"` (actually found guilty)
- `TICKET_ISSUED_DATE` within the last 2 years
- `AMT_BALANCE_DUE > 0` (still owing — the ticket is unresolved)
- non-null `LATITUDE` / `LONGITUDE`

~27 k "active problems" remain. This is what makes blight counts meaningful
instead of "every Detroit address has 500+ historical tickets within 300m".

## Data sources

| dataset             | host                               | method                                              |
|---------------------|------------------------------------|-----------------------------------------------------|
| RMS Crime Incidents | `services2.arcgis.com/qvkbeam7Wirps6zC/.../RMS_Crime_Incidents/FeatureServer/0` | live GET, `returnCountOnly=true` |
| Rental Registrations (Combined) | `services2.arcgis.com/.../Rental_Registrations_(Combined)/FeatureServer/0` | live GET, `returnCountOnly=true` |
| Blight Violations   | `apis.detroitmi.gov/data/blight_violations.zip` | one-time download, pandas in-memory |

All three are public City of Detroit data, no API key required.

The ArcGIS org ID in the Build Guide (`qvkbeam8BMY3o7yh`) does **not exist**.
The real org is `qvkbeam7Wirps6zC`, and the crime dataset is
`RMS_Crime_Incidents` (rolling, not per-year). The field name is
`incident_occurred_at`, not `incident_timestamp`.

## Known caveats (please read before writing pitch copy)

1. **`is_compliant` is a relative signal, not a legal verdict.**
   - `true` = "at least registered with BSEED" (stronger than nothing)
   - `false` = "no registration found nearby" (could be unregistered
     rental, OR could be a non-rental property like a business or vacant lot)
   Do **not** label a `false` result as "landlord is operating illegally" in
   the UI or model prompt — the user still has to verify Certificate of
   Compliance status themselves.

2. **The "8% compliant" statistic should cite the fully-compliant figure**,
   not this dataset's record count. Detroit has ~124 k rental properties;
   only ~8% are fully compliant with the rental ordinance (have a
   Certificate of Compliance). Our dataset's 4,573 rows reflect
   BSEED-registered rentals, which is a broader bucket than "fully compliant."

3. **Crime query falls back to a cached demo point** if the ArcGIS live
   query fails. This keeps the demo working if the network drops mid-pitch,
   but means a failed query returns "nearest demo point's count", not zero.
   See `crime_cache.json` (pre-generated by `pre_cache.py`).

4. **Nominatim geocoding is Person 2's territory.** The address pipeline lives
   in `pipeline.py`. The core scoring module still expects `lat`/`lng`.
   `/api/score_by_address`
   wraps this.

## Files

```
backend/
├── app.py              # Flask entry point, /api/score route
├── pipeline.py         # geocoding + UMich LLM explanation + address pipeline
├── scoring.py          # all business logic
├── pre_cache.py        # one-time data download + demo point caching
├── requirements.txt
├── .env                # UMICH_API_KEY / UMICH_BASE_URL / UMICH_MODEL (used by P2)
├── .env.example        # local template for the UMich hackathon LLM config
├── .gitignore
└── data/               # gitignored
    ├── blight_violations.csv   (128 MB, downloaded by pre_cache.py)
    └── crime_cache.json        (demo-point fallback for when ArcGIS is down)
```
