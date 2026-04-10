import os

import requests
from openai import OpenAI

try:
    from .scoring import compute_safety_score
except ImportError:
    from scoring import compute_safety_score


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "safelease-hackathon-2026"}
DEFAULT_UMICH_MODEL = "@azure-1/gpt-5.2"

_client = None


def geocode(address: str) -> dict:
    """Resolve a Detroit address to coordinates."""
    normalized_address = _normalize_address(address)
    response = requests.get(
        NOMINATIM_URL,
        params={"q": normalized_address, "format": "json", "limit": 1},
        headers=NOMINATIM_HEADERS,
        timeout=10,
    )
    response.raise_for_status()
    results = response.json()
    if not results:
        raise ValueError(f"address not found: {normalized_address}")

    first = results[0]
    return {
        "address": first.get("display_name", normalized_address),
        "lat": float(first["lat"]),
        "lng": float(first["lon"]),
    }


def generate_explanation(address: str, score_data: dict) -> str:
    """Generate a tenant-facing explanation with a safe fallback."""
    api_key = os.getenv("UMICH_API_KEY", "").strip()
    base_url = os.getenv("UMICH_BASE_URL", "").strip()
    if not api_key or not base_url:
        return _local_explanation(score_data)

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
3. One specific action they can take right now (verify the Certificate of Compliance, check with BSEED, etc.)

Do NOT assert the landlord is operating illegally - that requires the tenant to verify the Certificate of Compliance themselves."""

    try:
        response = _umich_client(api_key, base_url).responses.create(
            model=os.getenv("UMICH_MODEL", DEFAULT_UMICH_MODEL),
            instructions="You are a helpful assistant.",
            input=prompt,
        )
    except Exception:
        return _local_explanation(score_data)

    explanation = (getattr(response, "output_text", "") or "").strip()
    return explanation or _local_explanation(score_data)


def chat_with_context(message: str, address: str, score_data: dict, history: list) -> str:
    """Continue a tenant-advisor conversation with property context."""
    api_key = os.getenv("UMICH_API_KEY", "").strip()
    base_url = os.getenv("UMICH_BASE_URL", "").strip()
    if not api_key or not base_url:
        return _local_chat_reply(message, score_data)

    compliance_status = (
        "REGISTERED with BSEED"
        if score_data.get("is_compliant")
        else "no BSEED rental registration found nearby"
    )

    system_prompt = f"""You are a tenant rights advisor in Detroit, Michigan helping a renter evaluate a property.

Property context:
- Address: {address}
- Safety score: {score_data.get('score', 'N/A')} / 100 ({score_data.get('label', 'N/A')})
- Crime incidents nearby (500 m, last 90 days): {score_data.get('crime_count', 'N/A')}
- Blight violations nearby (300 m): {score_data.get('blight_count', 'N/A')}
- Rental compliance: {compliance_status}

Answer the tenant's questions concisely and in plain English. Limit your answers to topics related to this property, tenant rights in Detroit, rental compliance, safety, and housing. If a question is unrelated to these topics, politely decline and redirect to property-related questions. Do NOT assert the landlord is operating illegally without the tenant verifying the Certificate of Compliance themselves."""

    messages = [{"role": "system", "content": system_prompt}]
    for turn in history:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})

    try:
        client = _umich_client(api_key, base_url)
        response = client.chat.completions.create(
            model=os.getenv("UMICH_MODEL", DEFAULT_UMICH_MODEL),
            messages=messages,
        )
        reply = (response.choices[0].message.content or "").strip()
        return reply or _local_chat_reply(message, score_data)
    except Exception as exc:
        print(f"[chat_with_context] LLM call failed: {exc}")
        return _local_chat_reply(message, score_data)


def full_pipeline(address: str, blight_df) -> dict:
    location = geocode(address)
    score_data = compute_safety_score(blight_df, location["lat"], location["lng"])
    explanation = generate_explanation(location["address"], score_data)
    return {
        "address": location["address"],
        "lat": location["lat"],
        "lng": location["lng"],
        **score_data,
        "explanation": explanation,
    }


def _umich_client(api_key: str, base_url: str):
    global _client
    if _client is None:
        _client = OpenAI(api_key=api_key, base_url=base_url)
    return _client


def _normalize_address(address: str) -> str:
    cleaned = address.strip()
    if not cleaned:
        raise ValueError("address query param required")
    if "detroit" not in cleaned.lower():
        return f"{cleaned}, Detroit, MI"
    return cleaned


def _local_chat_reply(message: str, score_data: dict) -> str:
    """Simple keyword-based fallback when no LLM is available."""
    msg = message.lower()
    if any(w in msg for w in ("illegal", "register", "compli", "bseed", "certif")):
        if not score_data.get("is_compliant"):
            return (
                "No nearby BSEED rental registration was found for this address. "
                "Ask the landlord for a current Certificate of Compliance and verify it directly "
                "at detroitmi.gov/bseed or by calling 313-224-2733 before signing anything."
            )
        return (
            "The property appears to have a nearby BSEED registration on file. "
            "Still ask the landlord for the Certificate of Compliance to confirm the exact unit is covered."
        )
    if any(w in msg for w in ("crime", "safe", "danger", "neighborhood")):
        count = score_data.get("crime_count", 0)
        return (
            f"There were {count} crime incidents recorded within 500 m of this address in the last 90 days. "
            "Visit the block at different times of day to get a feel for the neighborhood before deciding."
        )
    if any(w in msg for w in ("blight", "violation", "condition", "repair")):
        count = score_data.get("blight_count", 0)
        return (
            f"There are {count} blight violations on record near this address. "
            "Inspect the building and surrounding properties carefully and document any visible issues."
        )
    if any(w in msg for w in ("score", "rating", "number", "mean", "what")):
        score = score_data.get("score", "N/A")
        label = score_data.get("label", "")
        return (
            f"This address scored {score}/100, placing it in the {label} category. "
            "Scores above 70 are low risk, 40–70 moderate, and below 40 high risk."
        )
    return (
        "I can help you understand your rights as a tenant and what this safety score means. "
        "Feel free to ask about the crime data, blight violations, rental compliance, or what steps to take next."
    )


def _local_explanation(score_data: dict) -> str:
    label = score_data["label"].lower()
    sentence_one = (
        f"This address scores {score_data['score']} out of 100, which puts it in the {label} range for a renter doing a quick safety check."
    )

    if not score_data["is_compliant"]:
        sentence_two = (
            "The biggest thing to verify is rental registration status, because no nearby BSEED registration was found for this location."
        )
        sentence_three = (
            "Before signing, ask the landlord for the Certificate of Compliance and confirm the address directly with BSEED."
        )
    elif score_data["blight_count"] > 10:
        sentence_two = (
            f"There are {score_data['blight_count']} active nearby blight issues, which suggests you should inspect the block and building condition carefully."
        )
        sentence_three = (
            "Visit the property in person, document visible repair issues, and ask the landlord what has been fixed recently."
        )
    else:
        sentence_two = (
            f"There have been {score_data['crime_count']} recent nearby crime incidents, so neighborhood conditions still deserve a closer look."
        )
        sentence_three = (
            "Check the block at a few different times of day and keep copies of any repair or safety promises in writing."
        )

    return " ".join([sentence_one, sentence_two, sentence_three])
