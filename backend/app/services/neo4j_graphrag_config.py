from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Neo4jGraphRagConfig:
    llm_provider: str
    openai_model: str
    openai_api_key: str | None
    openai_base_url: str | None
    openai_organization: str | None
    openai_project: str | None
    azure_openai_api_key: str | None
    azure_openai_endpoint: str | None
    azure_openai_deployment: str | None
    request_timeout_seconds: float
    temperature: float
    max_concurrency: int


def _normalize_azure_openai_endpoint(endpoint: str | None) -> str | None:
    if not endpoint:
        return None

    normalized = endpoint.strip().rstrip("/")
    if not normalized:
        return None

    if normalized.endswith("/openai/v1"):
        return normalized
    if normalized.endswith("/openai/v1/"):
        return normalized.rstrip("/")
    if normalized.endswith("/openai"):
        return f"{normalized}/v1"
    if "/openai/" in normalized:
        return normalized
    return f"{normalized}/openai/v1"


def get_neo4j_graphrag_config(provider_override: str | None = None) -> Neo4jGraphRagConfig:
    requested_provider = (
        provider_override
        if provider_override is not None
        else (os.getenv("ALIGNMENT_LLM_PROVIDER", "openai").strip().lower() or "openai")
    )
    azure_openai_api_key = (
        os.getenv("AZURE_OPENAI_KEY", "").strip()
        or os.getenv("AZURE_OPENAI_API_KEY", "").strip()
        or None
    )
    azure_openai_endpoint = _normalize_azure_openai_endpoint(
        os.getenv("AZURE_OPENAI_ENDPOINT", "").strip() or None
    )
    azure_openai_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "").strip() or None
    resolved_provider = requested_provider
    if requested_provider == "auto":
        resolved_provider = (
            "azure_openai"
            if azure_openai_api_key and azure_openai_endpoint and azure_openai_deployment
            else "openai"
        )

    return Neo4jGraphRagConfig(
        llm_provider=resolved_provider,
        openai_model=os.getenv("ALIGNMENT_OPENAI_MODEL", "gpt-5").strip() or "gpt-5",
        openai_api_key=(
            os.getenv("ALIGNMENT_OPENAI_API_KEY", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip()
            or None
        ),
        openai_base_url=os.getenv("ALIGNMENT_OPENAI_BASE_URL", "").strip() or None,
        openai_organization=os.getenv("ALIGNMENT_OPENAI_ORGANIZATION", "").strip() or None,
        openai_project=os.getenv("ALIGNMENT_OPENAI_PROJECT", "").strip() or None,
        azure_openai_api_key=azure_openai_api_key,
        azure_openai_endpoint=azure_openai_endpoint,
        azure_openai_deployment=azure_openai_deployment,
        request_timeout_seconds=float(os.getenv("ALIGNMENT_OPENAI_TIMEOUT_SECONDS", "90").strip() or "90"),
        temperature=float(os.getenv("ALIGNMENT_LLM_TEMPERATURE", "0").strip() or "0"),
        max_concurrency=int(os.getenv("ALIGNMENT_EXTRACTION_MAX_CONCURRENCY", "4").strip() or "4"),
    )
