# Frontend API Handoff

Use this endpoint from the React app:

## `GET /api/score_by_address?address=<string>`

Example:

```bash
curl 'http://127.0.0.1:8000/api/score_by_address?address=19935+Patton+St'
```

Example response:

```json
{
  "address": "19935, Patton Street, Evergreen Lahser 7/8, Detroit, Wayne County, Michigan, 48219, United States",
  "lat": 42.4372582,
  "lng": -83.2453411,
  "score": 85.2,
  "label": "LOW RISK",
  "crime_count": 39,
  "crime_score": 34.1,
  "blight_count": 9,
  "blight_score": 21.0,
  "is_compliant": true,
  "compliance_score": 30,
  "explanation": "A safety score of 85.2/100 suggests this area is considered low risk overall..."
}
```

## Supporting endpoint

Use this only if you need raw coordinates before requesting the score:

### `GET /api/geocode?address=<string>`

Example:

```bash
curl 'http://127.0.0.1:8000/api/geocode?address=1234+Woodward+Ave'
```

Example response:

```json
{
  "address": "1234, Woodward Avenue, Greektown, Detroit, Wayne County, Michigan, 48201, United States",
  "lat": 42.3332378,
  "lng": -83.0479574
}
```

## Frontend notes

- CORS is enabled.
- Send the plain user-entered address string. The backend appends `Detroit, MI` when needed.
- Display `score`, `label`, counts, and `explanation`.
- `label` is one of `LOW RISK`, `MODERATE RISK`, or `HIGH RISK`.
- `is_compliant` is not a legal verdict. Treat it as a signal that the frontend explains carefully.

## Error shape

```json
{
  "error": "..."
}
```

Common cases:

- `400` when `address` is missing
- `404` when Nominatim cannot find the address
- `502` when an upstream service fails
