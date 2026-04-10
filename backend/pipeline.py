import os

import requests
from openai import OpenAI

try:
    from .scoring import compute_safety_score
except ImportError:
    from scoring import compute_safety_score


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "staysignal-hackathon-2026"}
DEFAULT_UMICH_MODEL = "@azure-1/gpt-5.2"

_client = None

# Nominatim `type` values that clearly indicate a residential rental candidate
_RESIDENTIAL_TYPES = {
    "house", "detached", "semi_detached", "semidetached_house", "terrace",
    "apartments", "residential", "bungalow", "dormitory", "static_caravan",
}
# Nominatim `type` values that clearly indicate something that is NOT a rental
_NON_RESIDENTIAL_TYPES = {
    "hotel", "motel", "hostel", "guest_house",
    "office", "commercial", "retail", "shop", "supermarket", "mall",
    "restaurant", "cafe", "bar", "pub", "fast_food", "food_court",
    "hospital", "clinic", "pharmacy",
    "school", "university", "college", "kindergarten",
    "church", "cathedral", "mosque", "synagogue",
    "bank", "parking", "fuel", "museum", "theatre", "cinema", "stadium",
    "attraction",
}


def _is_residential(place_class: str, place_type: str):
    """Return True (residential), False (clearly non-residential), or None (unknown)."""
    t = (place_type or "").lower()
    c = (place_class or "").lower()
    if t in _RESIDENTIAL_TYPES:
        return True
    if t in _NON_RESIDENTIAL_TYPES:
        return False
    if c in {"tourism", "shop", "amenity", "leisure", "office", "healthcare"}:
        return False
    return None


def geocode(address: str) -> dict:
    """Resolve a Detroit address to coordinates + place metadata."""
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
        "place_class": first.get("class", "") or "",
        "place_type": first.get("type", "") or "",
    }


def generate_explanation(location: dict, score_data: dict) -> str:
    """Generate a scannable 3-line risk summary with a safe fallback."""
    address = location.get("address", "")
    place_class = location.get("place_class", "")
    place_type = location.get("place_type", "")
    residential = _is_residential(place_class, place_type)

    api_key = os.getenv("UMICH_API_KEY", "").strip()
    base_url = os.getenv("UMICH_BASE_URL", "").strip()
    if not api_key or not base_url:
        return _local_explanation(score_data, residential)

    # Adapt the prompt by place type
    if residential is True:
        compliance_value = (
            "REGISTERED with BSEED"
            if score_data.get("is_compliant")
            else "no BSEED rental registration found within 100m - worth verifying directly"
        )
        context_block = (
            f"Address: {address}\n"
            f"Safety score: {score_data['score']} / 100 ({score_data['label']})\n"
            f"Crime incidents nearby (500m, last 90 days): {score_data['crime_count']}\n"
            f"Blight violations nearby (300m): {score_data['blight_count']}\n"
            f"Rental compliance: {compliance_value}"
        )
        framing = "This is a residential address. One of the three reasons should reference rental compliance."
    elif residential is False:
        type_desc = (place_type or "non-residential location").replace("_", " ")
        context_block = (
            f"Address: {address}\n"
            f"Property type: {type_desc} (not a rental unit)\n"
            f"Safety score: {score_data['score']} / 100 ({score_data['label']})\n"
            f"Crime incidents nearby (500m, last 90 days): {score_data['crime_count']}\n"
            f"Blight violations nearby (300m): {score_data['blight_count']}"
        )
        framing = (
            f"This address is a {type_desc}, NOT a residential rental. Do NOT mention BSEED, "
            "rental registration, Certificate of Compliance, tenant rights, or landlords. "
            "Frame the reasons around neighborhood safety for a visitor or user of this place."
        )
    else:
        context_block = (
            f"Address: {address}\n"
            f"Safety score: {score_data['score']} / 100 ({score_data['label']})\n"
            f"Crime incidents nearby (500m, last 90 days): {score_data['crime_count']}\n"
            f"Blight violations nearby (300m): {score_data['blight_count']}"
        )
        framing = "The property type is unknown — do not assume it is a residential rental."

    prompt = (
        "You are summarizing Detroit public-safety data for someone evaluating this location.\n\n"
        f"{context_block}\n\n"
        f"{framing}\n\n"
        "Write exactly 3 short reasons that explain the safety score, grounded in the specific numbers above.\n"
        "- One reason per line, separated by a newline character.\n"
        "- Each line must cite at least one specific number from the data.\n"
        "- Maximum 22 words per line. No bullets, no numbering, no markdown, no headers.\n"
        "- Tone: direct and scannable.\n\n"
        "Do NOT assert any landlord is operating illegally."
    )

    try:
        response = _umich_client(api_key, base_url).responses.create(
            model=os.getenv("UMICH_MODEL", DEFAULT_UMICH_MODEL),
            instructions="You are a helpful assistant.",
            input=prompt,
        )
    except Exception:
        return _local_explanation(score_data, residential)

    explanation = (getattr(response, "output_text", "") or "").strip()
    return explanation or _local_explanation(score_data, residential)


def chat_with_context(message: str, address: str, score_data: dict, history: list) -> str:
    """Continue a conversation with property context. Adapts to residential vs non-residential."""
    api_key = os.getenv("UMICH_API_KEY", "").strip()
    base_url = os.getenv("UMICH_BASE_URL", "").strip()
    if not api_key or not base_url:
        return _local_chat_reply(message, score_data)

    place_class = score_data.get("place_class", "")
    place_type = score_data.get("place_type", "")
    residential = _is_residential(place_class, place_type)

    data_lines = [
        f"- Address: {address}",
        f"- Safety score: {score_data.get('score', 'N/A')} / 100 ({score_data.get('label', 'N/A')})",
        f"- Crime incidents nearby (500 m, last 90 days): {score_data.get('crime_count', 'N/A')}",
        f"- Blight violations nearby (300 m): {score_data.get('blight_count', 'N/A')}",
    ]
    if residential is True:
        compliance_value = (
            "REGISTERED with BSEED"
            if score_data.get("is_compliant")
            else "no BSEED rental registration found nearby"
        )
        data_lines.append(f"- Rental compliance: {compliance_value}")
        property_framing = "This is a residential address in Detroit."
    elif residential is False:
        type_desc = (place_type or "non-residential location").replace("_", " ")
        property_framing = (
            f"This address is a {type_desc}, NOT a residential rental. "
            "Do NOT frame answers around tenant rights, rental compliance, BSEED registration, "
            "or Certificates of Compliance unless the user explicitly asks. "
            "Focus on what actually matters for someone visiting or using this kind of place — "
            "safety, parking, walkability, neighborhood context."
        )
    else:
        property_framing = "The property type is not clearly residential — do not assume it is a rental."

    data_block = "\n".join(data_lines)

    system_prompt = (
        "You are helping someone evaluate a location in Detroit. Answer their questions directly and concisely.\n\n"
        f"{property_framing}\n\n"
        "Context:\n"
        f"{data_block}\n\n"
        "Rules:\n"
        "- Reference the data only when relevant to the user's question.\n"
        "- Do not force every answer to be about tenant rights or rental compliance.\n"
        "- If you cannot verify something from the context (live store hours, weather, specific prices), say so briefly and offer what you can.\n"
        "- Do NOT assert any landlord is operating illegally without verification.\n"
        "- Prefer short paragraphs and bullet points when listing things."
    )

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
    explanation = generate_explanation(location, score_data)
    return {
        "address": location["address"],
        "lat": location["lat"],
        "lng": location["lng"],
        "place_class": location.get("place_class", ""),
        "place_type": location.get("place_type", ""),
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


def _local_explanation(score_data: dict, residential=None) -> str:
    score = score_data.get("score", "N/A")
    label = score_data.get("label", "HIGH RISK").lower()
    crime = score_data.get("crime_count", 0)
    blight = score_data.get("blight_count", 0)
    is_compliant = score_data.get("is_compliant")

    line_one = f"Safety index sits at {score}/100, placing this location in the {label} tier."
    line_two = f"{crime} reported crime incidents within 500m in the last 90 days and {blight} active blight tickets within 300m."

    if residential is False:
        line_three = (
            f"With {crime} recent incidents nearby, plan visits during daylight and be mindful of walking routes and parking."
        )
    elif is_compliant:
        line_three = "A BSEED rental registration was found nearby; still ask the landlord for the current Certificate of Compliance for this specific unit."
    else:
        line_three = "No BSEED rental registration was found within 100m; verify the Certificate of Compliance directly before signing anything."

    return "\n".join([line_one, line_two, line_three])
