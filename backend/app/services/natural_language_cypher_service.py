from __future__ import annotations

import json
import os
import textwrap

from neo4j import GraphDatabase
from openai import OpenAI

from app.core.errors import ServiceError
from app.models.contracts import (
    NaturalLanguageCypherRequest,
    NaturalLanguageCypherResponse,
    OntologyInput,
)
from app.services.neo4j_graphrag_config import get_neo4j_graphrag_config

DEFAULT_NL_TO_CYPHER_SYSTEM_PROMPT = textwrap.dedent(
    """
    Role:
    You translate user questions into safe, read-only Cypher for a Neo4j ontology instance graph.

    Primary objective:
    - Convert natural language into one valid Cypher query.
    - Use the ontology schema exactly as provided.
    - Favor simple, readable Cypher that an analyst can inspect and run.

    Graph contract:
    - Nodes in the published graph use the :OntologyInstance label.
    - Relationships are stored between those nodes using domain-specific relationship types.
    - Common node properties include nodeId, label, classId, ingestRunId, and source.
    - Domain properties from the ontology are also stored directly on nodes.

    Query rules:
    - Return read-only Cypher only. Never write, update, delete, merge, call procedures, or use APOC.
    - Prefer MATCH / WHERE / RETURN / ORDER BY / LIMIT.
    - Always include LIMIT 25 unless the user explicitly asks for a smaller limit.
    - Do not invent entity classes, relationship types, node properties, or relationship properties.
    - Use only the exact classIds, node properties, relationship Cypher types, and relationship attributes provided in the schema context.
    - Use classId to filter entity classes when possible.
    - Use the ontology relationship ids as relationship types after converting non-alphanumeric characters to underscores and uppercasing the result.
    - Node label should remain :OntologyInstance unless the schema context explicitly says otherwise.
    - Relationship properties such as rank, year, quantity, amount, status, or dates live on the relationship only when the schema context lists them as relationship attributes.
    - If the user asks for a concept that is not present in the provided schema context, do not guess. Return a conservative fallback query and explain the mismatch in warnings.
    - If the request is ambiguous, produce the best reasonable query and add a warning.
    - If the request cannot be grounded in the ontology, return a conservative fallback query and explain why in warnings.

    Output rules:
    - Return strict JSON with keys: cypher, summary, warnings.
    - warnings must be an array of strings.
    """
).strip()


class NaturalLanguageCypherService:
    def translate(
        self,
        request: NaturalLanguageCypherRequest,
    ) -> NaturalLanguageCypherResponse:
        config = get_neo4j_graphrag_config(request.llm_provider_override)
        api_key = (
            config.azure_openai_api_key if config.llm_provider == "azure_openai" else config.openai_api_key
        )
        model_name = (
            config.azure_openai_deployment if config.llm_provider == "azure_openai" else config.openai_model
        )
        if not api_key:
            raise ServiceError(
                error_code="QUERY_TRANSLATION_CONFIG_ERROR",
                message="Natural language query translation requires an LLM API key",
                status_code=400,
                details={
                    "required_env": (
                        "AZURE_OPENAI_KEY or AZURE_OPENAI_API_KEY"
                        if config.llm_provider == "azure_openai"
                        else "ALIGNMENT_OPENAI_API_KEY or OPENAI_API_KEY"
                    )
                },
            )

        client_kwargs = {"api_key": api_key, "timeout": config.request_timeout_seconds}
        if config.llm_provider == "azure_openai":
            if not config.azure_openai_endpoint or not config.azure_openai_deployment:
                raise ServiceError(
                    error_code="QUERY_TRANSLATION_CONFIG_ERROR",
                    message="Azure OpenAI query translation requires endpoint and deployment",
                    status_code=400,
                    details={"required_env": "AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT"},
                )
            client_kwargs["base_url"] = config.azure_openai_endpoint
        elif config.openai_base_url:
            client_kwargs["base_url"] = config.openai_base_url
        if config.llm_provider != "azure_openai" and config.openai_organization:
            client_kwargs["organization"] = config.openai_organization
        if config.llm_provider != "azure_openai" and config.openai_project:
            client_kwargs["project"] = config.openai_project

        client = OpenAI(**client_kwargs)
        prompt = self._build_prompt(request)
        try:
            response = client.responses.create(
                model=model_name,
                reasoning={"effort": "medium"},
                input=prompt,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "natural_language_cypher_translation",
                        "schema": self._json_schema(),
                        "strict": True,
                    }
                },
            )
        except Exception as exc:
            from app.services.openai_error_utils import raise_openai_service_error

            raise_openai_service_error(
                exc=exc,
                provider=config.llm_provider,
                operation="QUERY_TRANSLATION",
                azure_endpoint=config.azure_openai_endpoint,
                azure_deployment=config.azure_openai_deployment,
            )

        try:
            payload = json.loads(response.output_text)
            return NaturalLanguageCypherResponse.model_validate(payload)
        except Exception as exc:
            raise ServiceError(
                error_code="QUERY_TRANSLATION_FAILED",
                message="Failed to parse the translated Cypher query",
                status_code=502,
                details={"error": str(exc)},
            ) from exc

    def _build_prompt(self, request: NaturalLanguageCypherRequest) -> str:
        ontology_summary = self._ontology_summary(request.ontology)
        database_schema_summary = self._database_schema_summary()
        database_block = (
            f"{database_schema_summary}\n\nUse the live Neo4j schema snapshot whenever it conflicts with the ontology schema."
            if database_schema_summary
            else "Live Neo4j schema snapshot: unavailable."
        )

        return textwrap.dedent(
            f"""
            {request.system_prompt_override or DEFAULT_NL_TO_CYPHER_SYSTEM_PROMPT}

            Ontology schema:
            {ontology_summary}

            {database_block}

            User question:
            {request.prompt}
            """
        ).strip()

    @staticmethod
    def _ontology_summary(ontology: OntologyInput) -> str:
        entities = []
        for entity in ontology.entityTypes:
            properties = ", ".join(
                f"{prop.name}:{prop.type}{' [identifier]' if prop.isIdentifier else ''}"
                for prop in entity.properties
            ) or "none"
            identifier_properties = ", ".join(
                prop.name for prop in entity.properties if prop.isIdentifier
            ) or "none"
            entities.append(
                f"- {entity.name} (classId={entity.id}) identifier_properties: {identifier_properties} properties: {properties}"
            )

        relationships = []
        entity_name_by_id = {entity.id: entity.name for entity in ontology.entityTypes}
        for relationship in ontology.relationships:
            attrs = ", ".join(
                f"{attr.name}:{attr.type}" for attr in (relationship.attributes or [])
            ) or "none"
            relationships.append(
                "- "
                f"{relationship.name} "
                f"({entity_name_by_id.get(relationship.from_entity_id, relationship.from_entity_id)} -> "
                f"{entity_name_by_id.get(relationship.to_entity_id, relationship.to_entity_id)}) "
                f"relation_id={relationship.id} "
                f"type={NaturalLanguageCypherService._relationship_type(relationship.id)} "
                f"attributes: {attrs}"
            )

        return "\n".join(
            [
                f"Ontology: {ontology.name}",
                f"Description: {ontology.description}",
                "Querying conventions:",
                "- Nodes use the Neo4j label :OntologyInstance.",
                "- Filter entity kinds with the classId property.",
                "- Use only the exact relationship Cypher types listed below.",
                "Entities:",
                *entities,
                "Relationships:",
                *relationships,
            ]
        )

    @staticmethod
    def _database_schema_summary() -> str | None:
        uri = os.getenv("NEO4J_URI", "").strip()
        username = os.getenv("NEO4J_USERNAME", "").strip()
        password = os.getenv("NEO4J_PASSWORD", "").strip()
        database = os.getenv("NEO4J_DATABASE", "neo4j").strip() or "neo4j"

        if not uri or not username or not password:
            return None

        direct_uri = uri.replace("neo4j://", "bolt://", 1)

        try:
            with GraphDatabase.driver(direct_uri, auth=(username, password)) as driver:
                node_records, _, _ = driver.execute_query(
                    """
                    MATCH (n:OntologyInstance)
                    RETURN n.classId AS classId, keys(n) AS properties
                    ORDER BY classId
                    LIMIT 100
                    """,
                    database_=database,
                )
                rel_records, _, _ = driver.execute_query(
                    """
                    MATCH (:OntologyInstance)-[r]->(:OntologyInstance)
                    RETURN type(r) AS relType, r.relationId AS relationId, keys(r) AS properties
                    ORDER BY relType
                    LIMIT 100
                    """,
                    database_=database,
                )
        except Exception:
            return None

        lines = ["Live Neo4j schema snapshot:"]
        if node_records:
            lines.append("Node classes and properties:")
            for record in node_records:
                properties = ", ".join(sorted(record.get("properties") or [])) or "none"
                lines.append(f"- classId={record.get('classId')}: {properties}")
        if rel_records:
            lines.append("Relationship types and properties:")
            for record in rel_records:
                properties = ", ".join(sorted(record.get("properties") or [])) or "none"
                relation_id = record.get("relationId") or "unknown"
                lines.append(
                    f"- type={record.get('relType')} relationId={relation_id}: {properties}"
                )
        return "\n".join(lines)

    @staticmethod
    def _relationship_type(name: str) -> str:
        cleaned = "".join(char if char.isalnum() else "_" for char in name)
        collapsed = "_".join(part for part in cleaned.split("_") if part)
        return collapsed.upper() or "RELATED_TO"

    @staticmethod
    def _json_schema() -> dict:
        return {
            "type": "object",
            "additionalProperties": False,
            "required": ["cypher", "summary", "warnings"],
            "properties": {
                "cypher": {"type": "string"},
                "summary": {"type": "string"},
                "warnings": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        }
