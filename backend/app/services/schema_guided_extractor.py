from __future__ import annotations

import re

from app.models.contracts import (
    CandidateSuggestions,
    OntologyInput,
    QueueCandidate,
    QueueCandidateStatus,
    ReviewPriority,
    SchemaSummary,
    SourceDocumentInput,
    SuggestionItem,
)


class SchemaGuidedExtractor:
    def extract_candidates(
        self,
        *,
        ontology: OntologyInput,
        schema: SchemaSummary,
        extraction_run_id: str,
        source_documents: list[SourceDocumentInput],
    ) -> list[QueueCandidate]:
        entity_by_id = {entity.id: entity for entity in ontology.entityTypes}
        queue_items: list[QueueCandidate] = []
        candidate_index = 1

        for source_document in source_documents:
            for relationship in ontology.relationships:
                relation_terms = self._build_relation_terms(relationship.name)
                matched_relation = self._first_matching_term(
                    source_document.text,
                    relation_terms,
                )
                if not matched_relation:
                    continue

                source_entity = entity_by_id[relationship.from_entity_id]
                target_entity = entity_by_id[relationship.to_entity_id]

                subject_text, subject_hit = self._extract_entity_text(
                    source_document.text,
                    source_entity.name,
                )
                object_text, object_hit = self._extract_entity_text(
                    source_document.text,
                    target_entity.name,
                )

                explicit_hits = int(subject_hit) + int(object_hit)
                extraction_confidence = 0.68 + (0.14 * explicit_hits)

                queue_items.append(
                    QueueCandidate(
                        candidate_id=f"cand_{candidate_index:04d}",
                        status=QueueCandidateStatus.NEW,
                        schema_version_id=schema.schema_version_id,
                        source_doc_id=source_document.source_doc_id
                        or f"doc_{candidate_index:04d}",
                        source_doc_name=source_document.source_doc_name,
                        doc_type=source_document.doc_type,
                        page=source_document.page,
                        source_snippet=source_document.text,
                        subject_text=subject_text,
                        relation_text=matched_relation,
                        object_text=object_text,
                        extraction_run_id=extraction_run_id,
                        extraction_confidence=min(0.96, extraction_confidence),
                        review_priority=ReviewPriority.NORMAL,
                        suggestions=CandidateSuggestions(
                            subject=[
                                SuggestionItem(
                                    target_id=source_entity.id,
                                    target_name=source_entity.name,
                                    score=0.98 if subject_hit else 0.78,
                                    reasons=self._build_subject_reasons(
                                        source_document.source_doc_id,
                                        subject_hit,
                                    ),
                                )
                            ],
                            relation=[
                                SuggestionItem(
                                    target_id=relationship.id,
                                    target_name=relationship.name,
                                    score=0.99,
                                    reasons=[
                                        "schema_guided_relation_match",
                                        f"matched_text: {matched_relation}",
                                    ],
                                )
                            ],
                            object=[
                                SuggestionItem(
                                    target_id=target_entity.id,
                                    target_name=target_entity.name,
                                    score=0.98 if object_hit else 0.78,
                                    reasons=self._build_object_reasons(
                                        source_document.source_doc_id,
                                        object_hit,
                                    ),
                                )
                            ],
                        ),
                    )
                )
                candidate_index += 1

        return queue_items

    @staticmethod
    def _build_relation_terms(name: str) -> list[str]:
        normalized = name.replace("_", " ").replace("-", " ")
        variants = {
            name,
            name.lower(),
            normalized,
            normalized.lower(),
        }
        return [variant for variant in variants if variant]

    @staticmethod
    def _first_matching_term(text: str, terms: list[str]) -> str | None:
        for term in sorted(terms, key=len, reverse=True):
            match = re.search(re.escape(term), text, re.IGNORECASE)
            if match:
                return match.group(0)
        return None

    @staticmethod
    def _extract_entity_text(text: str, entity_name: str) -> tuple[str, bool]:
        match = re.search(re.escape(entity_name), text, re.IGNORECASE)
        if match:
            return match.group(0), True
        return entity_name, False

    @staticmethod
    def _build_subject_reasons(source_doc_id: str | None, explicit_hit: bool) -> list[str]:
        reasons = ["schema_guided_subject_match"]
        reasons.append(
            "explicit_entity_mention" if explicit_hit else "fallback_to_schema_subject"
        )
        if source_doc_id:
            reasons.append(f"source_doc_id: {source_doc_id}")
        return reasons

    @staticmethod
    def _build_object_reasons(source_doc_id: str | None, explicit_hit: bool) -> list[str]:
        reasons = ["schema_guided_object_match"]
        reasons.append(
            "explicit_entity_mention" if explicit_hit else "fallback_to_schema_object"
        )
        if source_doc_id:
            reasons.append(f"source_doc_id: {source_doc_id}")
        return reasons
