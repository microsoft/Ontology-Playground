from __future__ import annotations

import asyncio
import importlib
import importlib.util
import re
import textwrap

from app.core.errors import ServiceError
from app.models.contracts import (
    OntologyInput,
    QueueCandidate,
    QueueCandidateStatus,
    ReviewPriority,
    RawExtractionPreview,
    RawExtractionNode,
    RawExtractionRelation,
    SchemaSummary,
    SourceDocumentInput,
    SuggestionItem,
    CandidateSuggestions,
)
from app.services.neo4j_graphrag_config import get_neo4j_graphrag_config
from app.services.extraction_mode import get_extraction_runtime_status


class Neo4jGraphRagAdapter:
    def extract_candidates(
        self,
        *,
        ontology: OntologyInput,
        schema: SchemaSummary,
        extraction_run_id: str,
        source_documents: list[SourceDocumentInput],
        extraction_prompt_override: str | None = None,
        llm_provider_override: str | None = None,
    ) -> list[QueueCandidate]:
        status = get_extraction_runtime_status()
        if not status.neo4j_graphrag_available:
            raise ServiceError(
                error_code="NEO4J_GRAPHRAG_NOT_READY",
                message=(
                    "neo4j-graphrag extraction mode was requested, but the runtime is not fully configured yet"
                ),
                status_code=503,
                details={
                    "mode": status.mode,
                    "missing_dependencies": ", ".join(status.missing_dependencies) or "none",
                    "source_path": status.source_path or "",
                    "next_step": (
                        "Install neo4j-graphrag and its required dependencies into alignment-api "
                        "or point ALIGNMENT_NEO4J_GRAPHRAG_SRC at the local src directory"
                    ),
                },
            )

        config = get_neo4j_graphrag_config(llm_provider_override)
        if config.llm_provider not in {"openai", "azure_openai"}:
            raise ServiceError(
                error_code="NEO4J_GRAPHRAG_CONFIG_ERROR",
                message="Only OpenAI-compatible providers are supported in the current integration phase",
                status_code=400,
                details={"llm_provider": config.llm_provider},
            )

        if importlib.util.find_spec("openai") is None:
            raise ServiceError(
                error_code="NEO4J_GRAPHRAG_NOT_READY",
                message="The openai package is required for neo4j-graphrag OpenAI extraction mode",
                status_code=503,
                details={"missing_dependency": "openai"},
            )

        api_key = config.azure_openai_api_key if config.llm_provider == "azure_openai" else config.openai_api_key
        if not api_key:
            raise ServiceError(
                error_code="NEO4J_GRAPHRAG_CONFIG_ERROR",
                message="Extraction mode requires an API key",
                status_code=400,
                details={
                    "required_env": (
                        "AZURE_OPENAI_KEY or AZURE_OPENAI_API_KEY"
                        if config.llm_provider == "azure_openai"
                        else "ALIGNMENT_OPENAI_API_KEY or OPENAI_API_KEY"
                    ),
                    "openai_model": (
                        config.azure_openai_deployment
                        if config.llm_provider == "azure_openai"
                        else config.openai_model
                    ),
                },
            )

        if config.llm_provider == "azure_openai" and (
            not config.azure_openai_endpoint or not config.azure_openai_deployment
        ):
            raise ServiceError(
                error_code="NEO4J_GRAPHRAG_CONFIG_ERROR",
                message="Azure OpenAI extraction mode requires endpoint and deployment",
                status_code=400,
                details={"required_env": "AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT"},
            )

        return asyncio.run(
            self._extract_with_openai(
                ontology=ontology,
                schema=schema,
                extraction_run_id=extraction_run_id,
                source_documents=source_documents,
                extraction_prompt_override=extraction_prompt_override,
                config=config,
            )
        )

    async def _extract_with_openai(
        self,
        *,
        ontology: OntologyInput,
        schema: SchemaSummary,
        extraction_run_id: str,
        source_documents: list[SourceDocumentInput],
        extraction_prompt_override: str | None,
        config,
    ) -> list[QueueCandidate]:
        llm_module = importlib.import_module("neo4j_graphrag.llm")
        extractor_module = importlib.import_module(
            "neo4j_graphrag.experimental.components.entity_relation_extractor"
        )
        schema_module = importlib.import_module(
            "neo4j_graphrag.experimental.components.schema"
        )
        types_module = importlib.import_module(
            "neo4j_graphrag.experimental.components.types"
        )

        LLMEntityRelationExtractor = getattr(extractor_module, "LLMEntityRelationExtractor")
        OnError = getattr(extractor_module, "OnError")
        SchemaBuilder = getattr(schema_module, "SchemaBuilder")
        NodeType = getattr(schema_module, "NodeType")
        RelationshipType = getattr(schema_module, "RelationshipType")
        PropertyType = getattr(schema_module, "PropertyType")
        DocumentInfo = getattr(types_module, "DocumentInfo")
        TextChunk = getattr(types_module, "TextChunk")
        TextChunks = getattr(types_module, "TextChunks")

        OpenAILLM = getattr(llm_module, "OpenAILLM")
        llm_kwargs = {
            "api_key": (
                config.azure_openai_api_key
                if config.llm_provider == "azure_openai"
                else config.openai_api_key
            ),
        }
        model_name = (
            config.azure_openai_deployment
            if config.llm_provider == "azure_openai"
            else config.openai_model
        )
        if config.llm_provider == "azure_openai":
            llm_kwargs["base_url"] = config.azure_openai_endpoint
        elif config.openai_base_url:
            llm_kwargs["base_url"] = config.openai_base_url
        if config.llm_provider != "azure_openai" and config.openai_organization:
            llm_kwargs["organization"] = config.openai_organization
        if config.llm_provider != "azure_openai" and config.openai_project:
            llm_kwargs["project"] = config.openai_project

        llm = OpenAILLM(
            model_name=model_name,
            model_params={"temperature": config.temperature},
            **llm_kwargs,
        )

        try:
            graph_schema = SchemaBuilder.create_schema_model(
                node_types=[
                    NodeType(
                        label=entity.name,
                        description=self._build_entity_description(entity),
                        properties=self._build_node_properties(PropertyType, entity.properties),
                    )
                    for entity in ontology.entityTypes
                ],
                relationship_types=[
                    RelationshipType(
                        label=relationship.name,
                        description=self._build_relationship_description(ontology, relationship),
                        properties=self._build_relationship_properties(PropertyType, relationship.attributes),
                    )
                    for relationship in ontology.relationships
                ],
                patterns=[
                    (
                        next(entity.name for entity in ontology.entityTypes if entity.id == relationship.from_entity_id),
                        relationship.name,
                        next(entity.name for entity in ontology.entityTypes if entity.id == relationship.to_entity_id),
                    )
                    for relationship in ontology.relationships
                ],
            )

            chunks = TextChunks(
                chunks=[
                    TextChunk(
                        text=document.text,
                        index=index,
                        metadata={
                            "source_doc_id": document.source_doc_id or f"doc_{index + 1:04d}",
                            "source_doc_name": document.source_doc_name,
                            "doc_type": document.doc_type,
                            "page": str(document.page),
                        },
                        uid=f"chunk_{index + 1:04d}",
                    )
                    for index, document in enumerate(source_documents)
                ]
            )

            extractor = LLMEntityRelationExtractor(
                llm=llm,
                prompt_template=extraction_prompt_override or self._build_prompt_template(),
                on_error=OnError.RAISE,
                create_lexical_graph=False,
                max_concurrency=config.max_concurrency,
                use_structured_output=llm.supports_structured_output,
            )
            graph = await extractor.run(
                chunks=chunks,
                document_info=DocumentInfo(path=source_documents[0].source_doc_name if source_documents else ontology.name),
                schema=graph_schema,
            )
            return self._map_graph_to_candidates(
                ontology=ontology,
                schema=schema,
                extraction_run_id=extraction_run_id,
                source_documents=source_documents,
                graph=graph,
            )
        except ServiceError:
            raise
        except Exception as exc:
            raise ServiceError(
                error_code="NEO4J_GRAPHRAG_EXTRACTION_FAILED",
                message="neo4j-graphrag extraction failed",
                status_code=502,
                details={"error_type": type(exc).__name__, "error": str(exc)},
            ) from exc
        finally:
            await llm.async_client.close()

    @staticmethod
    def _build_node_properties(PropertyType, ontology_properties):
        properties = []
        for prop in ontology_properties:
            properties.append(
                PropertyType(
                    name=prop.name,
                    type=Neo4jGraphRagAdapter._map_property_type(prop.type),
                    description=Neo4jGraphRagAdapter._build_property_description(prop),
                    required=bool(getattr(prop, "isIdentifier", False)),
                )
            )
        if not properties:
            properties.append(PropertyType(name="name", type="STRING", required=False))
        return properties

    @staticmethod
    def _build_relationship_properties(PropertyType, relationship_attributes):
        properties = []
        for attr in relationship_attributes or []:
            properties.append(
                PropertyType(
                    name=attr.name,
                    type=Neo4jGraphRagAdapter._map_property_type(attr.type),
                    description=f"Relationship attribute {attr.name}",
                    required=False,
                )
            )
        return properties

    @staticmethod
    def _build_property_description(prop) -> str:
        parts = []
        if getattr(prop, "description", None):
            parts.append(str(prop.description))
        if getattr(prop, "isIdentifier", False):
            parts.append("Identifier property")
        if getattr(prop, "unit", None):
            parts.append(f"Unit: {prop.unit}")
        if getattr(prop, "values", None):
            parts.append(f"Allowed values: {', '.join(prop.values)}")
        return " | ".join(parts)

    @staticmethod
    def _map_property_type(property_type: str) -> str:
        mapping = {
            "string": "STRING",
            "integer": "INTEGER",
            "float": "FLOAT",
            "boolean": "BOOLEAN",
            "date": "DATE",
        }
        return mapping.get(property_type.lower(), "STRING")

    def _map_graph_to_candidates(
        self,
        *,
        ontology: OntologyInput,
        schema: SchemaSummary,
        extraction_run_id: str,
        source_documents: list[SourceDocumentInput],
        graph,
    ) -> list[QueueCandidate]:
        node_index = {node.id: node for node in graph.nodes}
        document_lookup = {
            f"chunk_{index + 1:04d}": document
            for index, document in enumerate(source_documents)
        }

        candidates: list[QueueCandidate] = []
        for index, relationship in enumerate(graph.relationships, start=1):
            source_node = node_index.get(relationship.start_node_id)
            target_node = node_index.get(relationship.end_node_id)
            if not source_node or not target_node:
                continue

            chunk_id = relationship.start_node_id.split(":", 1)[0]
            source_document = document_lookup.get(chunk_id)
            source_text = self._node_display_text(source_node)
            object_text = self._node_display_text(target_node)
            relation_text = relationship.type

            subject_match = self._match_schema_class(schema, source_node.label)
            object_match = self._match_schema_class(schema, target_node.label)
            relation_match = self._match_schema_relation(schema, relation_text)
            if not (subject_match and object_match and relation_match):
                continue

            candidates.append(
                QueueCandidate(
                    candidate_id=f"cand_{index:04d}",
                    status=QueueCandidateStatus.NEW,
                    schema_version_id=schema.schema_version_id,
                    source_doc_id=(source_document.source_doc_id if source_document else f"doc_{index:04d}"),
                    source_doc_name=(source_document.source_doc_name if source_document else ontology.name),
                    doc_type=(source_document.doc_type if source_document else "text"),
                    page=(source_document.page if source_document else 1),
                    source_snippet=(source_document.text if source_document else ""),
                    subject_text=source_text,
                    relation_text=relation_text,
                    object_text=object_text,
                    extraction_run_id=extraction_run_id,
                    extraction_confidence=0.74,
                    review_priority=ReviewPriority.NORMAL,
                    suggestions=CandidateSuggestions(
                        subject=[
                            SuggestionItem(
                                target_id=subject_match["class_id"],
                                target_name=subject_match["name"],
                                score=0.95,
                                reasons=self._build_node_reasons(
                                    source_node,
                                    subject_match["class_id"],
                                    "subject",
                                ),
                            )
                        ],
                        relation=[
                            SuggestionItem(
                                target_id=relation_match["relation_id"],
                                target_name=relation_match["name"],
                                score=0.95,
                                reasons=self._build_relationship_reasons(relationship),
                            )
                        ],
                        object=[
                            SuggestionItem(
                                target_id=object_match["class_id"],
                                target_name=object_match["name"],
                                score=0.95,
                                reasons=self._build_node_reasons(
                                    target_node,
                                    object_match["class_id"],
                                    "object",
                                ),
                            )
                        ],
                    ),
                    raw_extraction=RawExtractionPreview(
                        subject=RawExtractionNode(
                            label=source_node.label,
                            properties=self._serialize_properties(getattr(source_node, "properties", {}) or {}),
                        ),
                        relation=RawExtractionRelation(
                            type=relationship.type,
                            properties=self._serialize_properties(getattr(relationship, "properties", {}) or {}),
                        ),
                        object=RawExtractionNode(
                            label=target_node.label,
                            properties=self._serialize_properties(getattr(target_node, "properties", {}) or {}),
                        ),
                    ),
                )
            )
        return candidates

    @staticmethod
    def _normalize_match_key(value: str) -> str:
        return "".join(char for char in value.casefold() if char.isalnum())

    @staticmethod
    def _build_entity_description(entity) -> str:
        property_names = ", ".join(prop.name for prop in entity.properties) or "none"
        identifier_names = ", ".join(prop.name for prop in entity.properties if getattr(prop, "isIdentifier", False)) or "none"
        return (
            f"{entity.description}. "
            f"Use this exact ontology label when the text implies this concept. "
            f"Known properties: {property_names}. "
            f"Identifier properties: {identifier_names}."
        )

    def _build_relationship_description(self, ontology: OntologyInput, relationship) -> str:
        source_name = next(
            (entity.name for entity in ontology.entityTypes if entity.id == relationship.from_entity_id),
            relationship.from_entity_id,
        )
        target_name = next(
            (entity.name for entity in ontology.entityTypes if entity.id == relationship.to_entity_id),
            relationship.to_entity_id,
        )
        attribute_names = ", ".join(attr.name for attr in relationship.attributes or []) or "none"
        split_camel = re.sub(r"(?<!^)(?=[A-Z])", " ", relationship.name).strip()
        synonym_hint = split_camel if split_camel else relationship.name
        description = relationship.description or f"{source_name} {relationship.name} {target_name}"
        return (
            f"{description}. "
            f"Map semantically equivalent phrases to the exact ontology relation label '{relationship.name}'. "
            f"Source type: {source_name}. Target type: {target_name}. "
            f"Relationship attributes: {attribute_names}. "
            f"Natural-language hint: {synonym_hint}."
        )

    @staticmethod
    def _build_prompt_template() -> str:
        return textwrap.dedent(
            """
            You are extracting graph facts from text using a user-authored ontology schema.

            Extract nodes and relationships from the input text, but normalize them to the ontology labels provided in the schema.
            If the text uses synonyms or paraphrases, map them to the closest ontology node label or relationship label instead of inventing a new label.
            Preserve concrete identifiers and values inside node properties and relationship properties whenever the schema suggests them.
            Relationship properties such as quantity, options, payment method, amount, status, dispatch dates, arrival dates, and shipment weights are important and should be captured when present.

            Return result as JSON using the following format:
            {{"nodes": [ {{"id": "0", "label": "Person", "properties": {{"name": "John"}} }}],
            "relationships": [{{"type": "KNOWS", "start_node_id": "0", "end_node_id": "1", "properties": {{"since": "2024-08-01"}} }}] }}

            Use only the following node and relationship types (if provided):
            {schema}

            Assign a unique ID (string) to each node, and reuse it to define relationships.
            Do respect the source and target node types for relationship and the relationship direction.

            Make sure you adhere to the following rules to produce valid JSON objects:
            - Do not return any additional information other than the JSON in it.
            - Omit any backticks around the JSON - simply output the JSON on its own.
            - The JSON object must not wrapped into a list - it is its own JSON object.
            - Property names must be enclosed in double quotes.

            Examples:
            {examples}

            Input text:

            {text}
            """
        ).strip()

    def _match_schema_class(self, schema: SchemaSummary, extracted_label: str):
        normalized = self._normalize_match_key(extracted_label)
        for schema_class in schema.classes:
            candidates = [schema_class.name, *schema_class.aliases]
            if any(self._normalize_match_key(candidate) == normalized for candidate in candidates):
                return schema_class.model_dump()
        return None

    def _match_schema_relation(self, schema: SchemaSummary, extracted_type: str):
        normalized = self._normalize_match_key(extracted_type)
        for relation in schema.relations:
            candidates = [relation.name, *relation.aliases]
            if any(self._normalize_match_key(candidate) == normalized for candidate in candidates):
                return relation.model_dump()
        return None

    @staticmethod
    def _node_display_text(node) -> str:
        properties = getattr(node, "properties", {}) or {}
        name = Neo4jGraphRagAdapter._string_property(properties, "name", "title")
        identifier = Neo4jGraphRagAdapter._string_property(
            properties,
            "assetTag",
            "asset_tag",
            "technicianId",
            "worker_id",
            "id",
        )

        if name and identifier and identifier.casefold() not in name.casefold():
            return f"{name} ({identifier})"
        if name and node.label.casefold() not in name.casefold():
            return f"{node.label} {name}"
        if name:
            return name
        if identifier and node.label.casefold() not in identifier.casefold():
            return f"{node.label} {identifier}"
        if identifier:
            return identifier
        return node.label

    @staticmethod
    def _string_property(properties: dict, *keys: str) -> str | None:
        for key in keys:
            value = properties.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _build_node_reasons(node, mapped_id: str, role: str) -> list[str]:
        properties = getattr(node, "properties", {}) or {}
        property_names = ", ".join(sorted(properties.keys())) or "none"
        return [
            f"neo4j_graphrag_{role}_label_match",
            f"mapped_schema_id: {mapped_id}",
            f"llm_node_label: {node.label}",
            f"llm_properties: {property_names}",
        ]

    @staticmethod
    def _build_relationship_reasons(relationship) -> list[str]:
        properties = getattr(relationship, "properties", {}) or {}
        property_names = ", ".join(sorted(properties.keys())) or "none"
        return [
            "neo4j_graphrag_relationship_type_match",
            f"llm_relationship_type: {relationship.type}",
            f"llm_relationship_properties: {property_names}",
        ]

    @staticmethod
    def _serialize_properties(properties: dict) -> dict[str, str | int | float | bool | None]:
        serialized: dict[str, str | int | float | bool | None] = {}
        for key, value in properties.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                serialized[key] = value
            else:
                serialized[key] = str(value)
        return serialized
