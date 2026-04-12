from __future__ import annotations

import base64
import json
import logging
import re
import textwrap
from io import BytesIO

from openai import OpenAI
from pypdf import PdfReader

from app.core.errors import ServiceError
from app.models.contracts import (
    OntologyDraftGenerationRequest,
    OntologyDraftGenerationResponse,
    ReferenceTextInput,
)
from app.services.neo4j_graphrag_config import get_neo4j_graphrag_config
from app.services.openai_error_utils import raise_openai_service_error

DEFAULT_ONTOLOGY_GENERATION_SYSTEM_PROMPT = textwrap.dedent(
    """
    Role:
    You are an expert Ontology Engineer and Data Architect designing a practical ontology draft for a visual ontology editor.

    Primary objective:
    - Convert the user's prompt and reference material into a clean, editable ontology JSON draft.
    - Produce a strong starting ontology, not a perfect final ontology.
    - Favor concepts, relations, and attributes that are explicit or strongly implied in the source material.

    Extraction procedure:
    1. Identify the core domain entities as ontology classes.
    2. Identify the actions or semantic associations between those classes as relationships.
    3. Identify stable descriptive fields, identifiers, states, dates, metrics, and categorical values as properties.
    4. If the text suggests attributes on a relationship itself, represent them as relationship attributes in the draft.
    5. Remove redundant or weak concepts unless they are necessary to preserve the domain structure.

    Modeling rules:
    - Classes should represent durable concepts, roles, actors, objects, events, or records.
    - Relationship names should describe domain meaning, not mirror raw sentence fragments.
    - Every class should include at least one identifier property whenever an identifier is available or strongly implied.
    - Include quantitative, temporal, or categorical properties when they are important for analytics or graph review.
    - Relationship attributes should be used for values such as quantity, options, amount, confidence, status, dates, or ranking when those belong to the connection rather than a single entity.
    - Keep the ontology reasonably compact and useful; avoid unnecessary abstraction.

    Naming rules:
    - Class names: singular, PascalCase, concise, domain-appropriate.
    - Property names: camelCase, readable, implementation-friendly.
    - Relationship names: camelCase, business-semantic, readable in a graph UI.
    - Relationship IDs and entity IDs must be stable, lowercase, and slug-friendly.

    Visual rules:
    - Choose distinct colors across classes.
    - Choose icons that are recognizable and useful in a graph canvas.

    Output rules:
    - Return a valid ontology JSON draft matching the required schema.
    - Populate assumptions only when you had to infer non-obvious structure.
    - Populate open questions only when ambiguity would materially change the ontology design.
    """
).strip()

MAX_REFERENCE_CHARS = 12000
MAX_TOTAL_REFERENCE_CHARS = 32000
MAX_CURRENT_ONTOLOGY_CHARS = 8000

logger = logging.getLogger(__name__)


class OntologyGenerationService:
    def generate_draft(
        self,
        request: OntologyDraftGenerationRequest,
    ) -> OntologyDraftGenerationResponse:
        if not request.prompt.strip() and not request.references:
            raise ServiceError(
                error_code="ONTOLOGY_GENERATION_INPUT_ERROR",
                message="Provide a prompt or at least one reference attachment to generate an ontology draft",
                status_code=400,
            )

        config = get_neo4j_graphrag_config(
            request.llm_provider_override,
            request.llm_credentials,
        )
        api_key = (
            config.azure_openai_api_key if config.llm_provider == "azure_openai" else config.openai_api_key
        )
        model_name = (
            config.azure_openai_deployment if config.llm_provider == "azure_openai" else "gpt-5.4"
        )
        if not api_key:
            raise ServiceError(
                error_code="ONTOLOGY_GENERATION_CONFIG_ERROR",
                message="Ontology generation requires an LLM API key",
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
                    error_code="ONTOLOGY_GENERATION_CONFIG_ERROR",
                    message="Azure OpenAI draft generation requires endpoint and deployment",
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
        logger.info(
            "Ontology draft request prepared provider=%s model=%s prompt_chars=%s reference_count=%s current_ontology=%s",
            config.llm_provider,
            model_name,
            len(prompt),
            len(request.references),
            request.current_ontology is not None,
        )
        try:
            response_kwargs = {
                "model": model_name,
                "input": prompt,
                "max_output_tokens": 4000,
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "ontology_draft_generation",
                        "schema": self._json_schema(),
                        "strict": True,
                    }
                },
            }
            if config.llm_provider != "azure_openai":
                response_kwargs["reasoning"] = {"effort": "low"}
            response = client.responses.create(**response_kwargs)
        except Exception as exc:
            raise_openai_service_error(
                exc=exc,
                provider=config.llm_provider,
                operation="ONTOLOGY_GENERATION",
                azure_endpoint=config.azure_openai_endpoint,
                azure_deployment=config.azure_openai_deployment,
            )

        try:
            payload = json.loads(response.output_text)
            validated = OntologyDraftGenerationResponse.model_validate(payload)
            return self._normalize_generated_ontology(validated)
        except Exception as exc:
            logger.exception(
                "Failed to parse ontology draft response provider=%s model=%s output_preview=%r",
                config.llm_provider,
                model_name,
                response.output_text[:2000],
            )
            raise ServiceError(
                error_code="ONTOLOGY_GENERATION_FAILED",
                message="Failed to parse the generated ontology draft",
                status_code=502,
                details={"error": str(exc)},
            ) from exc

    def _normalize_generated_ontology(
        self,
        response: OntologyDraftGenerationResponse,
    ) -> OntologyDraftGenerationResponse:
        icon_map = {
            "user": "👤",
            "person": "👤",
            "shield": "🛡️",
            "bar-chart-3": "📊",
            "clipboard-list": "📝",
            "activity": "🩺",
            "file-text": "📄",
            "layers": "🧩",
            "trophy": "🏆",
            "tag": "🏷️",
            "box": "📦",
            "package": "📦",
            "team": "🏀",
            "brand": "🏷️",
        }
        fallback_colors = [
            "#0078D4",
            "#107C10",
            "#D83B01",
            "#5C2D91",
            "#00A9E0",
            "#FFB900",
            "#E81123",
            "#008272",
        ]

        normalized_entities = []
        for index, entity in enumerate(response.ontology.entityTypes):
            icon_key = entity.icon.strip().lower()
            icon = icon_map.get(icon_key, entity.icon if any(ord(char) > 127 for char in entity.icon) else "📦")
            color = entity.color if entity.color.startswith("#") else fallback_colors[index % len(fallback_colors)]
            normalized_entities.append(entity.model_copy(update={"icon": icon, "color": color}))

        return response.model_copy(
            update={
                "ontology": response.ontology.model_copy(update={"entityTypes": normalized_entities})
            }
        )

    def _build_prompt(self, request: OntologyDraftGenerationRequest) -> str:
        normalized_references = self._normalize_references(request.references)
        references = self._build_reference_block(normalized_references)

        current_ontology = (
            self._summarize_current_ontology(request.current_ontology.model_dump(by_alias=True))
            if request.current_ontology
            else "No current ontology provided."
        )

        return textwrap.dedent(
            f"""
            {request.system_prompt_override or DEFAULT_ONTOLOGY_GENERATION_SYSTEM_PROMPT}

            User request:
            {request.prompt}

            Current ontology context:
            {current_ontology}

            Reference material:
            {references}
            """
        ).strip()

    def _normalize_references(self, references: list[ReferenceTextInput]) -> list[tuple[ReferenceTextInput, str]]:
        normalized: list[tuple[ReferenceTextInput, str]] = []
        for reference in references:
            if reference.text:
                normalized.append((reference, reference.text.strip()))
                continue
            if reference.content_base64:
                normalized.append((reference, self._extract_text_from_attachment(reference).strip()))
        return normalized

    def _extract_text_from_attachment(self, reference: ReferenceTextInput) -> str:
        if not reference.content_base64:
            return ""

        raw_bytes = base64.b64decode(reference.content_base64)
        lower_name = reference.reference_name.lower()

        if lower_name.endswith(".pdf"):
            reader = PdfReader(BytesIO(raw_bytes))
            pages: list[str] = []
            total_chars = 0
            for page in reader.pages:
                page_text = (page.extract_text() or "").strip()
                if not page_text:
                    continue
                remaining = MAX_REFERENCE_CHARS - total_chars
                if remaining <= 0:
                    break
                pages.append(page_text[:remaining])
                total_chars += len(pages[-1])
            return "\n".join(pages).strip()

        decoded = self._decode_text_bytes(raw_bytes)
        if lower_name.endswith(".html") or lower_name.endswith(".htm"):
            return self._strip_html(decoded)
        return decoded

    @staticmethod
    def _decode_text_bytes(raw_bytes: bytes) -> str:
        for encoding in ("utf-8", "utf-8-sig", "cp949", "latin-1"):
            try:
                return raw_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue
        return raw_bytes.decode("utf-8", errors="ignore")

    @staticmethod
    def _strip_html(text: str) -> str:
        no_scripts = re.sub(r"<(script|style)[^>]*>.*?</\\1>", " ", text, flags=re.IGNORECASE | re.DOTALL)
        without_tags = re.sub(r"<[^>]+>", " ", no_scripts)
        collapsed = re.sub(r"\s+", " ", without_tags)
        return collapsed.strip()

    @staticmethod
    def _truncate_text(text: str, limit: int) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 20].rstrip() + " [truncated]"

    def _build_reference_block(self, references: list[tuple[ReferenceTextInput, str]]) -> str:
        if not references:
            return "No additional reference texts were provided."

        parts: list[str] = []
        remaining = MAX_TOTAL_REFERENCE_CHARS
        for reference, reference_text in references:
            if remaining <= 0:
                break
            truncated = self._truncate_text(reference_text, min(MAX_REFERENCE_CHARS, remaining))
            if not truncated:
                continue
            block = f"[Reference: {reference.reference_name}]\n{truncated}"
            if len(block) > remaining:
                block = self._truncate_text(block, remaining)
            parts.append(block)
            remaining -= len(block)

        if not parts:
            return "No additional reference texts were provided."
        return "\n\n".join(parts)

    def _summarize_current_ontology(self, ontology_payload: dict) -> str:
        entity_types = ontology_payload.get("entityTypes", [])
        relationships = ontology_payload.get("relationships", [])
        summary = {
            "name": ontology_payload.get("name", ""),
            "description": ontology_payload.get("description", ""),
            "entityTypes": [
                {
                    "id": entity.get("id"),
                    "name": entity.get("name"),
                    "properties": [
                        {
                            "name": prop.get("name"),
                            "type": prop.get("type"),
                            "isIdentifier": prop.get("isIdentifier", False),
                        }
                        for prop in entity.get("properties", [])[:12]
                    ],
                }
                for entity in entity_types[:20]
            ],
            "relationships": [
                {
                    "id": rel.get("id"),
                    "name": rel.get("name"),
                    "from": rel.get("from"),
                    "to": rel.get("to"),
                    "attributes": rel.get("attributes", [])[:10] if rel.get("attributes") else [],
                }
                for rel in relationships[:30]
            ],
        }
        return self._truncate_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            MAX_CURRENT_ONTOLOGY_CHARS,
        )

    @staticmethod
    def _json_schema() -> dict:
        return {
            "type": "object",
            "additionalProperties": False,
            "required": ["ontology", "assumptions", "open_questions"],
            "properties": {
                "ontology": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "description", "entityTypes", "relationships"],
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "entityTypes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["id", "name", "description", "properties", "icon", "color"],
                                "properties": {
                                    "id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "description": {"type": "string"},
                                    "icon": {"type": "string"},
                                    "color": {"type": "string"},
                                    "properties": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "required": ["name", "type", "isIdentifier", "unit", "values", "description"],
                                            "properties": {
                                                "name": {"type": "string"},
                                                "type": {
                                                    "type": "string",
                                                    "enum": ["string", "integer", "decimal", "double", "date", "datetime", "boolean", "enum"],
                                                },
                                                "isIdentifier": {"type": "boolean"},
                                                "unit": {"type": ["string", "null"]},
                                                "values": {"type": ["array", "null"], "items": {"type": "string"}},
                                                "description": {"type": ["string", "null"]},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        "relationships": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["id", "name", "from", "to", "cardinality", "description", "attributes"],
                                "properties": {
                                    "id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "from": {"type": "string"},
                                    "to": {"type": "string"},
                                    "cardinality": {
                                        "type": "string",
                                        "enum": ["one-to-one", "one-to-many", "many-to-one", "many-to-many"],
                                    },
                                    "description": {"type": ["string", "null"]},
                                    "attributes": {
                                        "type": ["array", "null"],
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "required": ["name", "type"],
                                            "properties": {
                                                "name": {"type": "string"},
                                                "type": {"type": "string"},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "assumptions": {"type": "array", "items": {"type": "string"}},
                "open_questions": {"type": "array", "items": {"type": "string"}},
            },
        }
