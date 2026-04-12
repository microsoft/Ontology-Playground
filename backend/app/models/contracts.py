from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SchemaStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    DEPRECATED = "DEPRECATED"


class QueueCandidateStatus(str, Enum):
    NEW = "NEW"
    IN_REVIEW = "IN_REVIEW"
    APPROVED_STAGED = "APPROVED_STAGED"
    REJECTED = "REJECTED"
    DEFERRED = "DEFERRED"
    REREVIEW_REQUIRED = "REREVIEW_REQUIRED"


class ReviewPriority(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class ReviewAction(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    DEFER = "DEFER"


class SchemaClassSummary(BaseModel):
    class_id: str
    name: str
    aliases: list[str]
    description: str
    property_names: list[str]


class SchemaRelationSummary(BaseModel):
    relation_id: str
    name: str
    aliases: list[str]
    domain_class_id: str
    range_class_id: str


class SchemaSummary(BaseModel):
    schema_version_id: str
    version: int
    status: SchemaStatus
    name: str
    description: str
    published_at: datetime | None = None
    classes: list[SchemaClassSummary]
    relations: list[SchemaRelationSummary]


class SuggestionItem(BaseModel):
    target_id: str
    target_name: str
    score: float
    reasons: list[str]


class CandidateSuggestions(BaseModel):
    subject: list[SuggestionItem]
    relation: list[SuggestionItem]
    object: list[SuggestionItem]


class RawExtractionNode(BaseModel):
    label: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class RawExtractionRelation(BaseModel):
    type: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class RawExtractionPreview(BaseModel):
    subject: RawExtractionNode
    relation: RawExtractionRelation
    object: RawExtractionNode


class CandidateLock(BaseModel):
    locked_by: str
    locked_at: datetime
    expires_at: datetime


class QueueCandidate(BaseModel):
    candidate_id: str
    status: QueueCandidateStatus
    schema_version_id: str
    source_doc_id: str
    source_doc_name: str
    doc_type: str
    page: int
    source_snippet: str
    subject_text: str
    relation_text: str
    object_text: str
    extraction_run_id: str
    extraction_confidence: float
    review_priority: ReviewPriority
    assigned_reviewer_id: str | None = None
    lock: CandidateLock | None = None
    suggestions: CandidateSuggestions
    raw_extraction: RawExtractionPreview | None = None


class QueuePageResponse(BaseModel):
    items: list[QueueCandidate]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    active_schema_version_id: str


class CandidateLockRequest(BaseModel):
    reviewer_id: str = Field(min_length=1)
    lock_timeout_seconds: int = Field(default=300, ge=30, le=3600)


class CandidateLockResponse(BaseModel):
    candidate_id: str
    status: QueueCandidateStatus
    lock: CandidateLock


class ReviewDecisionRequest(BaseModel):
    candidate_id: str
    schema_version_id: str
    reviewer_id: str = Field(min_length=1)
    action: ReviewAction
    mapped_subject_class_id: str | None = None
    mapped_relation_id: str | None = None
    mapped_object_class_id: str | None = None
    reason_code: str
    comment: str | None = None
    idempotency_key: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_mapping_shape(self) -> "ReviewDecisionRequest":
        if self.action == ReviewAction.APPROVE:
            if not (
                self.mapped_subject_class_id
                and self.mapped_relation_id
                and self.mapped_object_class_id
            ):
                raise ValueError("APPROVE requires subject, relation, and object mappings")
        elif self.action == ReviewAction.REJECT:
            if any(
                [
                    self.mapped_subject_class_id,
                    self.mapped_relation_id,
                    self.mapped_object_class_id,
                ]
            ):
                raise ValueError("REJECT requires all mappings to be null")
        return self


class ReviewDecisionResponse(BaseModel):
    review_decision_id: str
    candidate_id: str
    status: QueueCandidateStatus
    staging_fact_id: str | None = None
    schema_version_id: str
    reviewed_at: datetime
    next_candidate_id: str | None = None


class SchemaDraftSaveRequest(BaseModel):
    base_schema_version_id: str
    editor_id: str = Field(min_length=1)
    name: str
    description: str
    classes: list[SchemaClassSummary]
    relations: list[SchemaRelationSummary]


class SchemaDraftSaveResponse(BaseModel):
    schema_version_id: str
    version: int
    status: SchemaStatus
    base_schema_version_id: str
    saved_at: datetime


class OntologyPropertyInput(BaseModel):
    name: str
    type: str
    isIdentifier: bool = False
    unit: str | None = None
    values: list[str] | None = None
    description: str | None = None


class OntologyRelationshipAttributeInput(BaseModel):
    name: str
    type: str


class OntologyEntityInput(BaseModel):
    id: str
    name: str
    description: str
    properties: list[OntologyPropertyInput]
    icon: str
    color: str


class OntologyRelationshipInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    from_entity_id: str = Field(alias="from")
    to_entity_id: str = Field(alias="to")
    cardinality: str
    description: str | None = None
    attributes: list[OntologyRelationshipAttributeInput] | None = None


class OntologyInput(BaseModel):
    name: str
    description: str
    entityTypes: list[OntologyEntityInput]
    relationships: list[OntologyRelationshipInput]


class SourceDocumentInput(BaseModel):
    source_doc_id: str | None = None
    source_doc_name: str
    doc_type: str
    page: int = Field(default=1, ge=1)
    text: str = Field(min_length=1)


class ReferenceTextInput(BaseModel):
    reference_name: str
    text: str | None = None
    content_base64: str | None = None
    media_type: str | None = None


class LlmCredentialsInput(BaseModel):
    openai_api_key: str | None = None
    openai_model: str | None = None
    azure_openai_api_key: str | None = None
    azure_openai_endpoint: str | None = None
    azure_openai_deployment: str | None = None


class LlmProviderConfigurationStatus(BaseModel):
    configured: bool
    missing_fields: list[str] = Field(default_factory=list)
    model: str | None = None


class LlmConfigurationStatusResponse(BaseModel):
    auto_resolves_to: str = Field(pattern="^(openai|azure_openai)$")
    openai: LlmProviderConfigurationStatus
    azure_openai: LlmProviderConfigurationStatus


class OntologyDraftGenerationRequest(BaseModel):
    prompt: str = ""
    references: list[ReferenceTextInput] = Field(default_factory=list)
    current_ontology: OntologyInput | None = None
    system_prompt_override: str | None = None
    llm_provider_override: str | None = Field(default=None, pattern="^(auto|openai|azure_openai)$")
    llm_credentials: LlmCredentialsInput | None = None


class OntologyDraftGenerationResponse(BaseModel):
    ontology: OntologyInput
    assumptions: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)


class LibraryOntologyItem(BaseModel):
    slug: str
    name: str
    description: str
    updated_at: datetime
    rdf_filename: str
    json_filename: str
    metadata_filename: str


class LibraryOntologyListResponse(BaseModel):
    items: list[LibraryOntologyItem]


class SaveOntologyLibraryRequest(BaseModel):
    slug: str | None = None
    name: str
    description: str
    ontology: OntologyInput
    rdf_content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SaveOntologyLibraryResponse(BaseModel):
    item: LibraryOntologyItem


class LibraryGraphItem(BaseModel):
    slug: str
    name: str
    description: str
    updated_at: datetime
    graph_filename: str
    metadata_filename: str
    source_ontology_name: str | None = None
    total_facts: int = 0


class LibraryGraphListResponse(BaseModel):
    items: list[LibraryGraphItem]


class SaveGraphLibraryRequest(BaseModel):
    slug: str | None = None
    name: str
    description: str
    source_ontology_name: str | None = None
    graph: InstanceGraphResponse
    metadata: dict[str, Any] = Field(default_factory=dict)


class SaveGraphLibraryResponse(BaseModel):
    item: LibraryGraphItem


class Neo4jPublishRequest(BaseModel):
    ingest_run_id: str = Field(min_length=1)
    graph: InstanceGraphResponse | None = None


class Neo4jPublishPreviewResponse(BaseModel):
    ingest_run_id: str
    node_count: int
    edge_count: int
    database: str
    source_schema_version_id: str | None = None


class Neo4jPublishResponse(BaseModel):
    ingest_run_id: str
    node_count: int
    edge_count: int
    database: str
    published_at: str


class Neo4jQueryRequest(BaseModel):
    mode: str = Field(pattern="^(cypher|ingest_run)$")
    query: str | None = None
    ingest_run_id: str | None = None
    limit: int = Field(default=25, ge=1, le=200)


class Neo4jQueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, str]]
    summary: str


class NaturalLanguageCypherRequest(BaseModel):
    prompt: str = Field(min_length=1)
    ontology: OntologyInput
    system_prompt_override: str | None = None
    llm_provider_override: str | None = Field(default=None, pattern="^(auto|openai|azure_openai)$")
    llm_credentials: LlmCredentialsInput | None = None


class NaturalLanguageCypherResponse(BaseModel):
    cypher: str
    summary: str
    warnings: list[str] = Field(default_factory=list)


class LlmDiagnosticChatRequest(BaseModel):
    prompt: str = Field(min_length=1)
    llm_provider_override: str | None = Field(default=None, pattern="^(auto|openai|azure_openai)$")
    llm_credentials: LlmCredentialsInput | None = None


class LlmDiagnosticChatResponse(BaseModel):
    provider: str
    model: str
    response_text: str


class GraphProjectionNode(BaseModel):
    node_id: str
    label: str
    entity_type_id: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    color: str


class GraphProjectionRelationship(BaseModel):
    relationship_id: str
    source_node_id: str
    target_node_id: str
    type: str
    cardinality: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class GraphProjection(BaseModel):
    nodes: list[GraphProjectionNode]
    relationships: list[GraphProjectionRelationship]


class OntologyGraphBuildRequest(BaseModel):
    editor_id: str = Field(min_length=1)
    ontology: OntologyInput
    source_documents: list[SourceDocumentInput] = Field(default_factory=list)
    extraction_prompt_override: str | None = None
    llm_provider_override: str | None = Field(default=None, pattern="^(auto|openai|azure_openai)$")
    llm_credentials: LlmCredentialsInput | None = None


class OntologyGraphBuildResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    extraction_run_id: str
    generated_at: datetime
    schema_summary: SchemaSummary = Field(alias="schema")
    queue: QueuePageResponse
    graph: GraphProjection
    source_documents_used: int


class StagingFactNode(BaseModel):
    text: str
    class_id: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class StagingFactRelation(BaseModel):
    text: str
    relation_id: str


class StagingFact(BaseModel):
    staging_fact_id: str
    review_decision_id: str
    candidate_id: str
    schema_version_id: str
    subject: StagingFactNode
    relation: StagingFactRelation
    object: StagingFactNode
    status: str = "STAGED"
    created_at: datetime


class ApprovedFactsResponse(BaseModel):
    items: list[StagingFact]
    total_items: int


class InstanceGraphNode(BaseModel):
    node_id: str
    label: str
    class_id: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class InstanceGraphEdge(BaseModel):
    edge_id: str
    source_node_id: str
    target_node_id: str
    relation_id: str
    label: str
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class InstanceGraphResponse(BaseModel):
    nodes: list[InstanceGraphNode]
    edges: list[InstanceGraphEdge]
    total_facts: int


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    error_code: str
    message: str
    details: dict[str, str] | None = None
