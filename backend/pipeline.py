import logging
import os

import requests
from openai import OpenAI

logger = logging.getLogger(__name__)

try:
    from .scoring import compute_safety_score
except ImportError:
    from scoring import compute_safety_score


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "safelease-hackathon-2026"}
DEFAULT_UMICH_MODEL = "@azure-1/gpt-5.2"

HOUSING_SYSTEM_PROMPT = (
    "You are a tenant rights advisor in Detroit, Michigan. "
    "You help tenants evaluate rental properties, understand their rights, "
    "and assess neighborhood safety. "
    "You ONLY discuss topics related to: housing safety and conditions, "
    "rental compliance and registrations (BSEED, Certificate of Compliance), "
    "tenant rights and lease guidance, neighborhood safety, crime and blight data, "
    "and Detroit housing resources. "
    "If a user asks about anything unrelated to housing, politely decline and "
    "redirect them to housing-related questions."
)

_client = None
# In-memory conversation store keyed by Nominatim display_name (address string).
_conversation_store: dict = {}


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
    """Generate a tenant-facing explanation and seed the conversation history."""
    api_key = os.getenv("UMICH_API_KEY", "").strip()
    base_url = os.getenv("UMICH_BASE_URL", "").strip()
    if not api_key or not base_url:
        return _local_explanation(score_data)

    compliance_status = (
        "REGISTERED with BSEED"
        if score_data["is_compliant"]
        else "no BSEED rental registration found nearby - worth verifying directly"
    )

    user_message = (
        f"A tenant has searched an address and received this safety data:\n\n"
        f"Address: {address}\n"
        f"Overall safety score: {score_data['score']} / 100 ({score_data['label']})\n"
        f"Crime incidents nearby (500m, last 90 days): {score_data['crime_count']}\n"
        f"Blight violations in the area (300m): {score_data['blight_count']}\n"
        f"Rental compliance status: {compliance_status}\n\n"
        f"Write 3 sentences in plain English:\n"
        f"1. What this score means for their safety\n"
        f"2. The most important thing to be aware of\n"
        f"3. One specific action they can take right now (verify the Certificate of Compliance, check with BSEED, etc.)\n\n"
        f"Do NOT assert the landlord is operating illegally - that requires the tenant to verify the Certificate of Compliance themselves."
    )

    messages = [
        {"role": "system", "content": HOUSING_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        response = _umich_client(api_key, base_url).chat.completions.create(
            model=os.getenv("UMICH_MODEL", DEFAULT_UMICH_MODEL),
            messages=messages,
        )
        explanation = response.choices[0].message.content.strip()
    except Exception:
        return _local_explanation(score_data)

    if not explanation:
        return _local_explanation(score_data)

    # Store conversation history so follow-up chats retain context.
    _conversation_store[address] = messages + [
        {"role": "assistant", "content": explanation}
    ]
    return explanation


def chat_followup(address: str, user_message: str) -> tuple:
    """Continue the conversation for a previously analysed address.

    Returns a (reply, found) tuple where *found* is False when no prior
    analysis exists for the address.
    """
    api_key = os.getenv("UMICH_API_KEY", "").strip()
    base_url = os.getenv("UMICH_BASE_URL", "").strip()
    if not api_key or not base_url:
        return "Chat is unavailable: UMICH_API_KEY and UMICH_BASE_URL must be set in .env.", True

    history = _conversation_store.get(address)
    if history is None:
        return None, False

    updated_history = history + [{"role": "user", "content": user_message}]

    try:
        response = _umich_client(api_key, base_url).chat.completions.create(
            model=os.getenv("UMICH_MODEL", DEFAULT_UMICH_MODEL),
            messages=updated_history,
        )
        reply = response.choices[0].message.content.strip()
    except Exception as exc:
        logger.exception("chat_followup request failed for address %r: %s", address, exc)
        return "Chat request failed. Please try again later.", True

    # Persist the updated history.
    _conversation_store[address] = updated_history + [
        {"role": "assistant", "content": reply}
    ]
    return reply, True


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
