from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import (
    get_natural_language_cypher_service,
    get_neo4j_query_service,
)
from app.models.contracts import (
    NaturalLanguageCypherRequest,
    NaturalLanguageCypherResponse,
    Neo4jQueryRequest,
    Neo4jQueryResponse,
)
from app.services.natural_language_cypher_service import NaturalLanguageCypherService
from app.services.neo4j_query_service import Neo4jQueryService

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
