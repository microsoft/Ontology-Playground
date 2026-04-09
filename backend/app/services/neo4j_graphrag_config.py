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
    temperature: float
    max_concurrency: int


def get_neo4j_graphrag_config() -> Neo4jGraphRagConfig:
    return Neo4jGraphRagConfig(
        llm_provider=(os.getenv("ALIGNMENT_LLM_PROVIDER", "openai").strip().lower() or "openai"),
        openai_model=os.getenv("ALIGNMENT_OPENAI_MODEL", "gpt-5").strip() or "gpt-5",
        openai_api_key=(
            os.getenv("ALIGNMENT_OPENAI_API_KEY", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip()
            or None
        ),
        openai_base_url=os.getenv("ALIGNMENT_OPENAI_BASE_URL", "").strip() or None,
        openai_organization=os.getenv("ALIGNMENT_OPENAI_ORGANIZATION", "").strip() or None,
        openai_project=os.getenv("ALIGNMENT_OPENAI_PROJECT", "").strip() or None,
        temperature=float(os.getenv("ALIGNMENT_LLM_TEMPERATURE", "0").strip() or "0"),
        max_concurrency=int(os.getenv("ALIGNMENT_EXTRACTION_MAX_CONCURRENCY", "4").strip() or "4"),
    )
