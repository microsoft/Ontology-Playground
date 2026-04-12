from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import (
    get_llm_diagnostic_service,
    get_natural_language_cypher_service,
    get_neo4j_query_service,
)
from app.models.contracts import (
    LlmConfigurationStatusResponse,
    LlmDiagnosticChatRequest,
    LlmDiagnosticChatResponse,
    NaturalLanguageCypherRequest,
    NaturalLanguageCypherResponse,
    Neo4jQueryRequest,
    Neo4jQueryResponse,
)
from app.services.natural_language_cypher_service import NaturalLanguageCypherService
from app.services.neo4j_query_service import Neo4jQueryService
from app.services.llm_diagnostic_service import LlmDiagnosticService

router = APIRouter(prefix="/api/query", tags=["query"])


@router.post("/neo4j", response_model=Neo4jQueryResponse)
def query_neo4j(
    request: Neo4jQueryRequest,
    service: Neo4jQueryService = Depends(get_neo4j_query_service),
) -> Neo4jQueryResponse:
    return service.execute(request)


@router.post("/translate-cypher", response_model=NaturalLanguageCypherResponse)
def translate_to_cypher(
    request: NaturalLanguageCypherRequest,
    service: NaturalLanguageCypherService = Depends(get_natural_language_cypher_service),
) -> NaturalLanguageCypherResponse:
    return service.translate(request)


@router.post("/diagnostic-chat", response_model=LlmDiagnosticChatResponse)
def diagnostic_chat(
    request: LlmDiagnosticChatRequest,
    service: LlmDiagnosticService = Depends(get_llm_diagnostic_service),
) -> LlmDiagnosticChatResponse:
    return service.chat(request)


@router.get("/llm-config-status", response_model=LlmConfigurationStatusResponse)
def llm_config_status(
    service: LlmDiagnosticService = Depends(get_llm_diagnostic_service),
) -> LlmConfigurationStatusResponse:
    return service.get_status()
