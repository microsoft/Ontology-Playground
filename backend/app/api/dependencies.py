from __future__ import annotations

from app.repositories.mock_repository import repository
from app.services.generation_service import GenerationService
from app.services.library_service import LibraryService
from app.services.neo4j_publish_service import Neo4jPublishService
from app.services.neo4j_query_service import Neo4jQueryService
from app.services.natural_language_cypher_service import NaturalLanguageCypherService
from app.services.ontology_generation_service import OntologyGenerationService
from app.services.queue_service import QueueService
from app.services.review_service import ReviewService
from app.services.schema_service import SchemaService


def get_generation_service() -> GenerationService:
    return GenerationService(repository)


def get_ontology_generation_service() -> OntologyGenerationService:
    return OntologyGenerationService()


def get_library_service() -> LibraryService:
    return LibraryService()


def get_neo4j_publish_service() -> Neo4jPublishService:
    return Neo4jPublishService(repository)


def get_neo4j_query_service() -> Neo4jQueryService:
    return Neo4jQueryService()


def get_natural_language_cypher_service() -> NaturalLanguageCypherService:
    return NaturalLanguageCypherService()


def get_schema_service() -> SchemaService:
    return SchemaService(repository)


def get_queue_service() -> QueueService:
    return QueueService(repository)


def get_review_service() -> ReviewService:
    return ReviewService(repository)
