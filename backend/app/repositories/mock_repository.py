from __future__ import annotations

import hashlib
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from math import ceil

from app.core.errors import ServiceError
from app.models.contracts import (
    CandidateLock,
    CandidateLockRequest,
    CandidateLockResponse,
    CandidateSuggestions,
    GraphProjection,
    GraphProjectionNode,
    GraphProjectionRelationship,
    OntologyGraphBuildRequest,
    OntologyGraphBuildResponse,
    OntologyInput,
    QueueCandidate,
    QueueCandidateStatus,
    QueuePageResponse,
    ReviewAction,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
    ReviewPriority,
    ApprovedFactsResponse,
    SchemaClassSummary,
    SchemaDraftSaveRequest,
    SchemaDraftSaveResponse,
    SchemaRelationSummary,
    SchemaStatus,
    SchemaSummary,
    SourceDocumentInput,
    StagingFact,
    StagingFactNode,
    StagingFactRelation,
    SuggestionItem,
    InstanceGraphResponse,
    InstanceGraphNode,
    InstanceGraphEdge,
)
from app.services.schema_guided_extractor import SchemaGuidedExtractor
from app.services.extraction_mode import get_extraction_runtime_status
from app.services.neo4j_graphrag_adapter import Neo4jGraphRagAdapter
from app.services.neo4j_graphrag_config import get_neo4j_graphrag_config
from app.services.schema_normalizer import SchemaNormalizer


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MockAlignmentRepository:
    def __init__(self) -> None:
        self.schema_normalizer = SchemaNormalizer()
        self.schema_guided_extractor = SchemaGuidedExtractor()
        self.neo4j_graphrag_adapter = Neo4jGraphRagAdapter()
        self.current_ontology: OntologyInput | None = None
        self.schemas: dict[str, SchemaSummary] = {}
        self.queue: list[QueueCandidate] = []
        self.review_decisions: list[dict[str, object]] = []
        self.staging_facts: list[StagingFact] = []
        self.idempotency_index: dict[str, tuple[ReviewDecisionRequest, ReviewDecisionResponse]] = {}
        self.active_schema_version_id: str | None = None
        self._seed()

    def _seed(self) -> None:
        schema = SchemaSummary(
            schema_version_id="schema_v1",
            version=1,
            status=SchemaStatus.PUBLISHED,
            name="Refinery Maintenance Ontology",
            description="Published schema used for Phase 1 maintenance review alignment",
            published_at=datetime(2026, 4, 8, 1, 0, tzinfo=timezone.utc),
            classes=[
                SchemaClassSummary(
                    class_id="class_worker",
                    name="Worker",
                    aliases=["Engineer", "Technician", "Operator"],
                    description="A human actor who performs or supervises maintenance work.",
                    property_names=["worker_id", "name", "role"],
                ),
                SchemaClassSummary(
                    class_id="class_equipment",
                    name="Equipment",
                    aliases=["Pump", "Valve", "Compressor", "Motor"],
                    description="A physical asset used in plant operations.",
                    property_names=["asset_tag", "name", "equipment_type"],
                ),
                SchemaClassSummary(
                    class_id="class_failure_cause",
                    name="FailureCause",
                    aliases=["Fault Cause", "Failure Reason", "Damage Cause"],
                    description="A cause or explanation for an equipment issue.",
                    property_names=["code", "label"],
                ),
            ],
            relations=[
                SchemaRelationSummary(
                    relation_id="rel_repaired",
                    name="REPAIRED",
                    aliases=["수리함", "정비함"],
                    domain_class_id="class_worker",
                    range_class_id="class_equipment",
                ),
                SchemaRelationSummary(
                    relation_id="rel_inspected",
                    name="INSPECTED",
                    aliases=["점검함", "검사함"],
                    domain_class_id="class_worker",
                    range_class_id="class_equipment",
                ),
                SchemaRelationSummary(
                    relation_id="rel_caused_by",
                    name="CAUSED_BY",
                    aliases=["원인은", "기인함"],
                    domain_class_id="class_equipment",
                    range_class_id="class_failure_cause",
                ),
            ],
        )
        self.schemas[schema.schema_version_id] = schema
        self.active_schema_version_id = schema.schema_version_id

        def hints(target_id: str, target_name: str, score: float, reasons: list[str]) -> list[SuggestionItem]:
            return [SuggestionItem(target_id=target_id, target_name=target_name, score=score, reasons=reasons)]

        self.queue = [
            QueueCandidate(
                candidate_id="cand_0001",
                status=QueueCandidateStatus.NEW,
                schema_version_id="schema_v1",
                source_doc_id="maint_log_251024_pdf",
                source_doc_name="정비일지_251024.pdf",
                doc_type="maintenance_log",
                page=14,
                source_snippet="김엔지니어가 V-101 펌프를 분해 점검 후 베어링 손상으로 판단하여 수리함.",
                subject_text="김엔지니어",
                relation_text="수리함",
                object_text="V-101 펌프",
                extraction_run_id="extract_run_20260408_001",
                extraction_confidence=0.81,
                review_priority=ReviewPriority.NORMAL,
                suggestions=CandidateSuggestions(
                    subject=hints("class_worker", "Worker", 0.93, ["alias_match: engineer", "person-title pattern"]),
                    relation=hints("rel_repaired", "REPAIRED", 0.91, ["alias_match: 수리함"]),
                    object=hints("class_equipment", "Equipment", 0.96, ["asset-tag pattern: V-101"]),
                ),
            ),
            QueueCandidate(
                candidate_id="cand_0002",
                status=QueueCandidateStatus.NEW,
                schema_version_id="schema_v1",
                source_doc_id="maint_log_251024_pdf",
                source_doc_name="정비일지_251024.pdf",
                doc_type="maintenance_log",
                page=15,
                source_snippet="오퍼레이터 박씨가 P-220 모터 진동을 확인하고 추가 점검을 요청함.",
                subject_text="오퍼레이터 박씨",
                relation_text="점검함",
                object_text="P-220 모터",
                extraction_run_id="extract_run_20260408_001",
                extraction_confidence=0.77,
                review_priority=ReviewPriority.NORMAL,
                suggestions=CandidateSuggestions(
                    subject=hints("class_worker", "Worker", 0.88, ["role-title overlap"]),
                    relation=hints("rel_inspected", "INSPECTED", 0.86, ["alias_match: 점검함"]),
                    object=hints("class_equipment", "Equipment", 0.94, ["asset-tag pattern: P-220"]),
                ),
            ),
            QueueCandidate(
                candidate_id="cand_0003",
                status=QueueCandidateStatus.NEW,
                schema_version_id="schema_v1",
                source_doc_id="failure_report_251026_pdf",
                source_doc_name="고장보고서_251026.pdf",
                doc_type="failure_report",
                page=4,
                source_snippet="V-101 펌프의 반복 정지는 윤활 부족에 기인한 것으로 분석됨.",
                subject_text="V-101 펌프",
                relation_text="기인함",
                object_text="윤활 부족",
                extraction_run_id="extract_run_20260408_002",
                extraction_confidence=0.84,
                review_priority=ReviewPriority.HIGH,
                suggestions=CandidateSuggestions(
                    subject=hints("class_equipment", "Equipment", 0.95, ["asset-tag pattern: V-101"]),
                    relation=hints("rel_caused_by", "CAUSED_BY", 0.82, ["alias_match: 기인함"]),
                    object=hints("class_failure_cause", "FailureCause", 0.79, ["cause lexicon overlap"]),
                ),
            ),
        ]

    def reset(self) -> None:
        self.schemas.clear()
        self.queue.clear()
        self.review_decisions.clear()
        self.staging_facts.clear()
        self.idempotency_index.clear()
        self.current_ontology = None
        self._seed()

    def build_graph_from_ontology(
        self,
        request: OntologyGraphBuildRequest,
    ) -> OntologyGraphBuildResponse:
        ontology = request.ontology
        self._validate_ontology_input(ontology)

        schema_version = self._next_schema_version()
        schema_version_id = self._schema_version_id_for_ontology(ontology, schema_version)
        extraction_run_id = self._extraction_run_id_for_ontology(ontology, schema_version)
        generated_at = utcnow()
        source_documents = (
            request.source_documents
            if request.source_documents
            else self._synthesize_source_documents(ontology)
        )

        schema = self.schema_normalizer.normalize(
            ontology=ontology,
            schema_version_id=schema_version_id,
            schema_version=schema_version,
            generated_at=generated_at,
        )

        runtime_status = get_extraction_runtime_status()
        llm_config = get_neo4j_graphrag_config(request.llm_provider_override)
        llm_ready = bool(
            (
                llm_config.azure_openai_api_key
                and llm_config.azure_openai_endpoint
                and llm_config.azure_openai_deployment
            )
            if llm_config.llm_provider == "azure_openai"
            else llm_config.openai_api_key
        )
        use_neo4j_graphrag = runtime_status.mode == "neo4j_graphrag" or (
            runtime_status.mode == "auto"
            and runtime_status.neo4j_graphrag_available
            and llm_ready
        )
        if use_neo4j_graphrag:
            queue_items = self.neo4j_graphrag_adapter.extract_candidates(
                ontology=ontology,
                schema=schema,
                extraction_run_id=extraction_run_id,
                source_documents=source_documents,
                extraction_prompt_override=request.extraction_prompt_override,
                llm_provider_override=request.llm_provider_override,
            )
        else:
            queue_items = self.schema_guided_extractor.extract_candidates(
                ontology=ontology,
                schema=schema,
                extraction_run_id=extraction_run_id,
                source_documents=source_documents,
            )
            if not queue_items:
                queue_items = self._build_queue_from_documents(
                    ontology=ontology,
                    schema=schema,
                    extraction_run_id=extraction_run_id,
                    source_documents=source_documents,
                )
        graph = self._build_graph_projection(ontology=ontology, queue_items=queue_items)
        queue = QueuePageResponse(
            items=queue_items,
            page=1,
            page_size=max(1, min(len(queue_items), 20)) if queue_items else 1,
            total_items=len(queue_items),
            total_pages=max(1, ceil(len(queue_items) / 20)) if queue_items else 1,
            active_schema_version_id=schema.schema_version_id,
        )

        for existing_schema in self.schemas.values():
            if existing_schema.status == SchemaStatus.PUBLISHED:
                existing_schema.status = SchemaStatus.DEPRECATED
        self.schemas[schema.schema_version_id] = schema
        self.current_ontology = ontology.model_copy(deep=True)
        self.queue = queue_items
        self.active_schema_version_id = schema.schema_version_id
        self.review_decisions.clear()
        self.staging_facts.clear()
        self.idempotency_index.clear()

        return OntologyGraphBuildResponse(
            extraction_run_id=extraction_run_id,
            generated_at=generated_at,
            schema=deepcopy(schema),
            queue=deepcopy(queue),
            graph=deepcopy(graph),
            source_documents_used=len(source_documents),
        )

    def get_schema(self, schema_version_id: str) -> SchemaSummary:
        schema = self.schemas.get(schema_version_id)
        if not schema:
            raise ServiceError(
                error_code="SCHEMA_NOT_FOUND",
                message="Schema version was not found",
                status_code=404,
                details={"schema_version_id": schema_version_id},
            )
        return deepcopy(schema)

    def save_schema_draft(self, request: SchemaDraftSaveRequest) -> SchemaDraftSaveResponse:
        base_schema = self.schemas.get(request.base_schema_version_id)
        if not base_schema:
            raise ServiceError(
                error_code="SCHEMA_NOT_FOUND",
                message="Base schema version was not found",
                status_code=404,
                details={"base_schema_version_id": request.base_schema_version_id},
            )

        class_names = [item.name.lower() for item in request.classes]
        if len(class_names) != len(set(class_names)):
            raise ServiceError(
                error_code="SCHEMA_CONFLICT",
                message="Duplicate class names are not allowed in a draft",
                status_code=409,
            )

        draft_version = max(schema.version for schema in self.schemas.values()) + 1
        draft_id = f"schema_v{draft_version}_draft"
        draft = SchemaSummary(
            schema_version_id=draft_id,
            version=draft_version,
            status=SchemaStatus.DRAFT,
            name=request.name,
            description=request.description,
            published_at=None,
            classes=request.classes,
            relations=request.relations,
        )
        self.schemas[draft_id] = draft
        return SchemaDraftSaveResponse(
            schema_version_id=draft_id,
            version=draft_version,
            status=SchemaStatus.DRAFT,
            base_schema_version_id=base_schema.schema_version_id,
            saved_at=utcnow(),
        )

    def get_queue(
        self,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        reviewer_id: str | None = None,
        schema_version_id: str | None = None,
        doc_type: str | None = None,
    ) -> QueuePageResponse:
        items = deepcopy(self.queue)
        if status:
            items = [item for item in items if item.status.value == status]
        if reviewer_id:
            items = [item for item in items if item.assigned_reviewer_id == reviewer_id]
        if schema_version_id:
            items = [item for item in items if item.schema_version_id == schema_version_id]
        if doc_type:
            items = [item for item in items if item.doc_type == doc_type]

        total_items = len(items)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = items[start:end]
        active_schema_version_id = (
            page_items[0].schema_version_id
            if page_items
            else (self.active_schema_version_id or "schema_v1")
        )
        return QueuePageResponse(
            items=page_items,
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=max(1, ceil(total_items / page_size)) if total_items else 1,
            active_schema_version_id=active_schema_version_id,
        )

    def lock_candidate(self, candidate_id: str, request: CandidateLockRequest) -> CandidateLockResponse:
        candidate = self._get_candidate_ref(candidate_id)
        now = utcnow()
        current_lock = candidate.lock
        if current_lock and current_lock.expires_at > now and current_lock.locked_by != request.reviewer_id:
            raise ServiceError(
                error_code="LOCK_CONFLICT",
                message="Candidate is already locked by another reviewer",
                status_code=409,
                details={"candidate_id": candidate_id, "locked_by": current_lock.locked_by},
            )

        new_lock = CandidateLock(
            locked_by=request.reviewer_id,
            locked_at=now,
            expires_at=now + timedelta(seconds=request.lock_timeout_seconds),
        )
        candidate.lock = new_lock
        candidate.status = QueueCandidateStatus.IN_REVIEW
        return CandidateLockResponse(
            candidate_id=candidate.candidate_id,
            status=candidate.status,
            lock=deepcopy(new_lock),
        )

    def submit_review(self, request: ReviewDecisionRequest) -> ReviewDecisionResponse:
        schema = self.schemas.get(request.schema_version_id)
        if not schema or schema.status != SchemaStatus.PUBLISHED:
            raise ServiceError(
                error_code="INVALID_SCHEMA_VERSION",
                message="Review submissions require a published schema version",
                status_code=400,
                details={"schema_version_id": request.schema_version_id},
            )

        existing = self.idempotency_index.get(request.idempotency_key)
        if existing:
            existing_request, existing_response = existing
            if existing_request.model_dump() != request.model_dump():
                raise ServiceError(
                    error_code="IDEMPOTENCY_CONFLICT",
                    message="Idempotency key already exists for a different payload",
                    status_code=409,
                )
            return deepcopy(existing_response)

        candidate = self._get_candidate_ref(request.candidate_id)
        self._validate_candidate_lock(candidate, request.reviewer_id)

        if candidate.status in {
            QueueCandidateStatus.APPROVED_STAGED,
            QueueCandidateStatus.REJECTED,
            QueueCandidateStatus.DEFERRED,
        }:
            raise ServiceError(
                error_code="REVIEW_ALREADY_FINALIZED",
                message="Candidate was already finalized",
                status_code=409,
                details={"candidate_id": candidate.candidate_id},
            )

        review_id = f"review_{len(self.review_decisions) + 1:04d}"
        reviewed_at = utcnow()

        staging_fact_id: str | None = None
        if request.action == ReviewAction.APPROVE:
            candidate.status = QueueCandidateStatus.APPROVED_STAGED
            staging_fact_id = f"staging_fact_{len(self.staging_facts) + 1:04d}"
            self.staging_facts.append(
                StagingFact(
                    staging_fact_id=staging_fact_id,
                    review_decision_id=review_id,
                    candidate_id=candidate.candidate_id,
                    schema_version_id=request.schema_version_id,
                    subject=StagingFactNode(
                        text=candidate.subject_text,
                        class_id=request.mapped_subject_class_id or "",
                        properties=(candidate.raw_extraction.subject.properties if candidate.raw_extraction else {}),
                    ),
                    relation=StagingFactRelation(
                        text=candidate.relation_text,
                        relation_id=request.mapped_relation_id or "",
                    ),
                    object=StagingFactNode(
                        text=candidate.object_text,
                        class_id=request.mapped_object_class_id or "",
                        properties=(candidate.raw_extraction.object.properties if candidate.raw_extraction else {}),
                    ),
                    created_at=reviewed_at,
                )
            )
        elif request.action == ReviewAction.REJECT:
            candidate.status = QueueCandidateStatus.REJECTED
        else:
            candidate.status = QueueCandidateStatus.DEFERRED

        candidate.lock = None
        candidate.assigned_reviewer_id = request.reviewer_id

        response = ReviewDecisionResponse(
            review_decision_id=review_id,
            candidate_id=candidate.candidate_id,
            status=candidate.status,
            staging_fact_id=staging_fact_id,
            schema_version_id=request.schema_version_id,
            reviewed_at=reviewed_at,
            next_candidate_id=self._find_next_candidate(candidate.candidate_id),
        )
        self.review_decisions.append(
            {
                "review_decision_id": review_id,
                "request": request.model_dump(),
                "response": response.model_dump(mode="json"),
            }
        )
        self.idempotency_index[request.idempotency_key] = (request.model_copy(deep=True), response.model_copy(deep=True))
        return deepcopy(response)

    def get_approved_facts(self) -> ApprovedFactsResponse:
        return ApprovedFactsResponse(
            items=deepcopy(self.staging_facts),
            total_items=len(self.staging_facts),
        )

    def get_instance_graph(self) -> InstanceGraphResponse:
        nodes: dict[str, InstanceGraphNode] = {}
        edges: list[InstanceGraphEdge] = []

        for fact in self.staging_facts:
          source_node_id = self._instance_node_id(fact.subject.class_id, fact.subject.text, fact.subject.properties)
          target_node_id = self._instance_node_id(fact.object.class_id, fact.object.text, fact.object.properties)

          if source_node_id not in nodes:
              nodes[source_node_id] = InstanceGraphNode(
                  node_id=source_node_id,
                  label=fact.subject.text,
                  class_id=fact.subject.class_id,
                  properties={
                      "source": "approved_review",
                      **fact.subject.properties,
                  },
              )

          if target_node_id not in nodes:
              nodes[target_node_id] = InstanceGraphNode(
                  node_id=target_node_id,
                  label=fact.object.text,
                  class_id=fact.object.class_id,
                  properties={
                      "source": "approved_review",
                      **fact.object.properties,
                  },
              )

          edges.append(
              InstanceGraphEdge(
                  edge_id=fact.staging_fact_id,
                  source_node_id=source_node_id,
                  target_node_id=target_node_id,
                  relation_id=fact.relation.relation_id,
                  label=fact.relation.text,
                  properties={
                      "review_decision_id": fact.review_decision_id,
                      "schema_version_id": fact.schema_version_id,
                  },
              )
          )

        return InstanceGraphResponse(
            nodes=list(nodes.values()),
            edges=edges,
            total_facts=len(self.staging_facts),
        )

    def _instance_node_id(
        self,
        class_id: str,
        fallback_text: str,
        properties: dict[str, object],
    ) -> str:
        identifier_value = self._resolve_identifier_value(class_id, properties)
        if identifier_value:
            return f"{class_id}:{identifier_value}"
        return f"{class_id}:{fallback_text}"

    def _resolve_identifier_value(
        self,
        class_id: str,
        properties: dict[str, object],
    ) -> str | None:
        if not self.current_ontology:
            return None

        entity = next(
            (entity for entity in self.current_ontology.entityTypes if entity.id == class_id),
            None,
        )
        if not entity:
            return None

        identifier_names = [prop.name for prop in entity.properties if getattr(prop, "isIdentifier", False)]
        normalized_properties = {self._normalize_property_key(key): value for key, value in properties.items()}

        for identifier_name in identifier_names:
            value = normalized_properties.get(self._normalize_property_key(identifier_name))
            if value is not None and str(value).strip():
                return str(value).strip()

        for fallback_name in ("name", "fullName", "title"):
            value = normalized_properties.get(self._normalize_property_key(fallback_name))
            if value is not None and str(value).strip():
                return str(value).strip()

        return None

    @staticmethod
    def _normalize_property_key(value: str) -> str:
        return "".join(char for char in value.casefold() if char.isalnum())

    def _find_next_candidate(self, current_candidate_id: str) -> str | None:
        current_index = next(
            (index for index, item in enumerate(self.queue) if item.candidate_id == current_candidate_id),
            -1,
        )
        if current_index == -1:
            return None

        for item in self.queue[current_index + 1 :]:
            if item.status == QueueCandidateStatus.NEW:
                return item.candidate_id
        for item in self.queue:
            if item.status == QueueCandidateStatus.NEW:
                return item.candidate_id
        return None

    def _validate_candidate_lock(self, candidate: QueueCandidate, reviewer_id: str) -> None:
        now = utcnow()
        if not candidate.lock or candidate.lock.expires_at <= now:
            raise ServiceError(
                error_code="LOCK_REQUIRED",
                message="Candidate must be actively locked before review submission",
                status_code=409,
                details={"candidate_id": candidate.candidate_id},
            )
        if candidate.lock.locked_by != reviewer_id:
            raise ServiceError(
                error_code="LOCK_CONFLICT",
                message="Candidate lock belongs to a different reviewer",
                status_code=409,
                details={"candidate_id": candidate.candidate_id, "locked_by": candidate.lock.locked_by},
            )

    def _get_candidate_ref(self, candidate_id: str) -> QueueCandidate:
        for candidate in self.queue:
            if candidate.candidate_id == candidate_id:
                return candidate
        raise ServiceError(
            error_code="CANDIDATE_NOT_FOUND",
            message="Candidate was not found",
            status_code=404,
            details={"candidate_id": candidate_id},
        )

    def _validate_ontology_input(self, ontology: OntologyInput) -> None:
        if not ontology.entityTypes:
            raise ServiceError(
                error_code="ONTOLOGY_EMPTY",
                message="Ontology must include at least one entity type",
                status_code=400,
            )

        entity_ids = [entity.id for entity in ontology.entityTypes]
        if len(entity_ids) != len(set(entity_ids)):
            raise ServiceError(
                error_code="ONTOLOGY_CONFLICT",
                message="Ontology entity IDs must be unique",
                status_code=409,
            )

        relation_ids = [relationship.id for relationship in ontology.relationships]
        if len(relation_ids) != len(set(relation_ids)):
            raise ServiceError(
                error_code="ONTOLOGY_CONFLICT",
                message="Ontology relationship IDs must be unique",
                status_code=409,
            )

        known_entities = set(entity_ids)
        for relationship in ontology.relationships:
            if relationship.from_entity_id not in known_entities or relationship.to_entity_id not in known_entities:
                raise ServiceError(
                    error_code="ONTOLOGY_REFERENCE_INVALID",
                    message="Relationship references an unknown entity type",
                    status_code=400,
                    details={"relationship_id": relationship.id},
                )

    def _next_schema_version(self) -> int:
        if not self.schemas:
            return 1
        return max(schema.version for schema in self.schemas.values()) + 1

    def _synthesize_source_documents(
        self,
        ontology: OntologyInput,
    ) -> list[SourceDocumentInput]:
        entity_by_id = {entity.id: entity for entity in ontology.entityTypes}
        documents: list[SourceDocumentInput] = []

        for index, relationship in enumerate(ontology.relationships, start=1):
            source = entity_by_id[relationship.from_entity_id]
            target = entity_by_id[relationship.to_entity_id]
            description = relationship.description or (
                f"{source.name} {relationship.name} {target.name}"
            )
            documents.append(
                SourceDocumentInput(
                    source_doc_id=f"{_slugify(ontology.name)}_rel_{index:04d}",
                    source_doc_name=f"{ontology.name}.ontology",
                    doc_type="ontology_schema",
                    page=index,
                    text=(
                        f"Schema-guided source snippet: {source.name} {relationship.name} {target.name}. "
                        f"{description}."
                    ),
                )
            )

        return documents

    def _build_queue_from_documents(
        self,
        *,
        ontology: OntologyInput,
        schema: SchemaSummary,
        extraction_run_id: str,
        source_documents: list[SourceDocumentInput],
    ) -> list[QueueCandidate]:
        entity_by_id = {entity.id: entity for entity in ontology.entityTypes}
        relationship_count = len(ontology.relationships)
        if relationship_count == 0:
            return []

        queue_items: list[QueueCandidate] = []
        for index, source_document in enumerate(source_documents, start=1):
            relationship = ontology.relationships[(index - 1) % relationship_count]
            source = entity_by_id[relationship.from_entity_id]
            target = entity_by_id[relationship.to_entity_id]
            queue_items.append(
                QueueCandidate(
                    candidate_id=f"cand_{index:04d}",
                    status=QueueCandidateStatus.NEW,
                    schema_version_id=schema.schema_version_id,
                    source_doc_id=source_document.source_doc_id,
                    source_doc_name=source_document.source_doc_name,
                    doc_type=source_document.doc_type,
                    page=source_document.page,
                    source_snippet=source_document.text,
                    subject_text=source.name,
                    relation_text=relationship.name,
                    object_text=target.name,
                    extraction_run_id=extraction_run_id,
                    extraction_confidence=0.82 if source_document.doc_type != "ontology_schema" else 1.0,
                    review_priority=ReviewPriority.NORMAL,
                    suggestions=CandidateSuggestions(
                        subject=[
                            SuggestionItem(
                                target_id=source.id,
                                target_name=source.name,
                                score=1.0,
                                reasons=[
                                    "schema_guided_projection: source entity",
                                    f"source_doc_id: {source_document.source_doc_id}",
                                ],
                            )
                        ],
                        relation=[
                            SuggestionItem(
                                target_id=relationship.id,
                                target_name=relationship.name,
                                score=1.0,
                                reasons=[
                                    "schema_guided_projection: relationship pattern",
                                    f"source_doc_id: {source_document.source_doc_id}",
                                ],
                            )
                        ],
                        object=[
                            SuggestionItem(
                                target_id=target.id,
                                target_name=target.name,
                                score=1.0,
                                reasons=[
                                    "schema_guided_projection: target entity",
                                    f"source_doc_id: {source_document.source_doc_id}",
                                ],
                            )
                        ],
                    ),
                )
            )

        return queue_items

    def _build_graph_projection(
        self,
        *,
        ontology: OntologyInput,
        queue_items: list[QueueCandidate],
    ) -> GraphProjection:
        entity_by_id = {entity.id: entity for entity in ontology.entityTypes}
        relationship_lookup = {relationship.id: relationship for relationship in ontology.relationships}

        nodes = [
            GraphProjectionNode(
                node_id=entity.id,
                label=entity.name,
                entity_type_id=entity.id,
                properties={
                    "description": entity.description,
                    "identifier_property": self._identifier_property_name(entity.properties),
                    "property_count": len(entity.properties),
                },
                color=entity.color,
            )
            for entity in ontology.entityTypes
        ]

        relationships: list[GraphProjectionRelationship] = []
        for queue_item in queue_items:
            suggested_relation_id = queue_item.suggestions.relation[0].target_id if queue_item.suggestions.relation else None
            matched_relation = next(
                (
                    relationship
                    for relationship in ontology.relationships
                    if relationship.id == suggested_relation_id
                    or relationship.name == queue_item.relation_text
                ),
                None,
            )
            if not matched_relation:
                continue
            relationships.append(
                GraphProjectionRelationship(
                    relationship_id=matched_relation.id,
                    source_node_id=matched_relation.from_entity_id,
                    target_node_id=matched_relation.to_entity_id,
                    type=matched_relation.name.upper().replace("-", "_"),
                    cardinality=matched_relation.cardinality,
                    properties={
                        "description": matched_relation.description,
                        "source_doc_id": queue_item.source_doc_id,
                    },
                )
            )

        if not relationships:
            relationships = [
                GraphProjectionRelationship(
                    relationship_id=relationship.id,
                    source_node_id=relationship.from_entity_id,
                    target_node_id=relationship.to_entity_id,
                    type=relationship.name.upper().replace("-", "_"),
                    cardinality=relationship.cardinality,
                    properties={"description": relationship.description},
                )
                for relationship in relationship_lookup.values()
            ]

        return GraphProjection(nodes=nodes, relationships=relationships)

    def _build_queue_from_ontology(
        self,
        *,
        ontology: OntologyInput,
        schema: SchemaSummary,
        extraction_run_id: str,
    ) -> list[QueueCandidate]:
        entity_by_id = {entity.id: entity for entity in ontology.entityTypes}
        queue_items: list[QueueCandidate] = []

        for index, relationship in enumerate(ontology.relationships, start=1):
            source = entity_by_id[relationship.from_entity_id]
            target = entity_by_id[relationship.to_entity_id]
            queue_items.append(
                QueueCandidate(
                    candidate_id=f"cand_{index:04d}",
                    status=QueueCandidateStatus.NEW,
                    schema_version_id=schema.schema_version_id,
                    source_doc_id=schema.schema_version_id,
                    source_doc_name=f"{ontology.name}.ontology",
                    doc_type="ontology_schema",
                    page=1,
                    source_snippet=(
                        f"Schema projection candidate: {source.name} {relationship.name} {target.name}. "
                        f"Generated directly from the user-authored ontology."
                    ),
                    subject_text=source.name,
                    relation_text=relationship.name,
                    object_text=target.name,
                    extraction_run_id=extraction_run_id,
                    extraction_confidence=1.0,
                    review_priority=ReviewPriority.NORMAL,
                    suggestions=CandidateSuggestions(
                        subject=[
                            SuggestionItem(
                                target_id=source.id,
                                target_name=source.name,
                                score=1.0,
                                reasons=["schema_projection: exact source entity"],
                            )
                        ],
                        relation=[
                            SuggestionItem(
                                target_id=relationship.id,
                                target_name=relationship.name,
                                score=1.0,
                                reasons=["schema_projection: exact relationship"],
                            )
                        ],
                        object=[
                            SuggestionItem(
                                target_id=target.id,
                                target_name=target.name,
                                score=1.0,
                                reasons=["schema_projection: exact target entity"],
                            )
                        ],
                    ),
                )
            )

        return queue_items

    def _schema_version_id_for_ontology(self, ontology: OntologyInput, schema_version: int) -> str:
        digest = hashlib.sha1(
            ontology.model_dump_json(by_alias=True, exclude_none=True).encode("utf-8")
        ).hexdigest()[:10]
        slug = _slugify(ontology.name)
        return f"schema_v{schema_version}_{slug}_{digest}"

    def _extraction_run_id_for_ontology(self, ontology: OntologyInput, schema_version: int) -> str:
        digest = hashlib.sha1(
            ontology.model_dump_json(by_alias=True, exclude_none=True).encode("utf-8")
        ).hexdigest()[:10]
        return f"extract_run_v{schema_version}_{digest}"

    def _entity_aliases(self, entity_name: str) -> list[str]:
        normalized = entity_name.strip()
        collapsed = normalized.replace("_", " ").replace("-", " ")
        aliases = [normalized]
        if collapsed.lower() != normalized.lower():
            aliases.append(collapsed)
        return aliases

    def _relation_aliases(self, relation_name: str) -> list[str]:
        normalized = relation_name.strip()
        collapsed = normalized.replace("_", " ").replace("-", " ")
        upper_snake = re.sub(r"[^A-Za-z0-9]+", "_", normalized).strip("_").upper()
        aliases = [normalized]
        for alias in (collapsed, upper_snake):
            if alias and alias.lower() not in {item.lower() for item in aliases}:
                aliases.append(alias)
        return aliases

    def _identifier_property_name(self, properties: list[object]) -> str | None:
        for prop in properties:
            if getattr(prop, "isIdentifier", False):
                return getattr(prop, "name", None)
        return None


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "ontology"


repository = MockAlignmentRepository()
