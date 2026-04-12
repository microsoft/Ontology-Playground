from __future__ import annotations

from datetime import datetime
import re

from app.models.contracts import (
    OntologyInput,
    SchemaClassSummary,
    SchemaRelationSummary,
    SchemaStatus,
    SchemaSummary,
)


class SchemaNormalizer:
    def normalize(
        self,
        *,
        ontology: OntologyInput,
        schema_version_id: str,
        schema_version: int,
        generated_at: datetime,
    ) -> SchemaSummary:
        return SchemaSummary(
            schema_version_id=schema_version_id,
            version=schema_version,
            status=SchemaStatus.PUBLISHED,
            name=ontology.name,
            description=ontology.description or "User-authored ontology projected into alignment graph",
            published_at=generated_at,
            classes=[
                SchemaClassSummary(
                    class_id=entity.id,
                    name=entity.name,
                    aliases=self._entity_aliases(entity.name),
                    description=entity.description,
                    property_names=[prop.name for prop in entity.properties],
                )
                for entity in ontology.entityTypes
            ],
            relations=[
                SchemaRelationSummary(
                    relation_id=relationship.id,
                    name=relationship.name,
                    aliases=self._relation_aliases(relationship.name, relationship.description),
                    domain_class_id=relationship.from_entity_id,
                    range_class_id=relationship.to_entity_id,
                )
                for relationship in ontology.relationships
            ],
        )

    @staticmethod
    def _entity_aliases(name: str) -> list[str]:
        aliases = {name}
        aliases.add(name.replace("_", " "))
        aliases.add(name.replace("-", " "))
        return [alias for alias in aliases if alias]

    @staticmethod
    def _relation_aliases(name: str, description: str | None = None) -> list[str]:
        normalized = name.replace("_", " ").replace("-", " ")
        aliases = {name, normalized, normalized.lower()}
        split_camel = re.sub(r"(?<!^)(?=[A-Z])", " ", name).strip()
        if split_camel:
            aliases.add(split_camel)
            aliases.add(split_camel.lower())
        if description:
            words = re.findall(r"[A-Za-z]+", description)
            if words:
                phrase = " ".join(words[:3]).strip()
                if phrase:
                    aliases.add(phrase)
                    aliases.add(phrase.lower())
        return [alias for alias in aliases if alias]
