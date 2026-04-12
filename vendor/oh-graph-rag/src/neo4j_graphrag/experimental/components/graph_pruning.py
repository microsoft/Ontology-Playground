#  Copyright (c) "Neo4j"
#  Neo4j Sweden AB [https://neo4j.com]
#  #
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  #
#      https://www.apache.org/licenses/LICENSE-2.0
#  #
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
import enum
import json
import logging
from typing import Optional, Any, TypeVar, Generic, Union

from pydantic import validate_call, BaseModel

from neo4j_graphrag.experimental.components.schema import (
    GraphSchema,
    Pattern,
    PropertyType,
    NodeType,
    RelationshipType,
)
from neo4j_graphrag.experimental.components.types import (
    Neo4jGraph,
    Neo4jNode,
    Neo4jRelationship,
    LexicalGraphConfig,
)
from neo4j_graphrag.experimental.pipeline import Component, DataModel

logger = logging.getLogger(__name__)


class PruningReason(str, enum.Enum):
    NOT_IN_SCHEMA = "NOT_IN_SCHEMA"
    MISSING_REQUIRED_PROPERTY = "MISSING_REQUIRED_PROPERTY"
    NO_PROPERTY_LEFT = "NO_PROPERTY_LEFT"
    INVALID_START_OR_END_NODE = "INVALID_START_OR_END_NODE"
    INVALID_PATTERN = "INVALID_PATTERN"
    MISSING_LABEL = "MISSING_LABEL"


ItemType = TypeVar("ItemType")


class PrunedItem(BaseModel, Generic[ItemType]):
    label: str
    item: ItemType
    pruned_reason: PruningReason
    metadata: dict[str, Any] = {}


class PruningStats(BaseModel):
    pruned_nodes: list[PrunedItem[Neo4jNode]] = []
    pruned_relationships: list[PrunedItem[Neo4jRelationship]] = []
    pruned_properties: list[PrunedItem[str]] = []

    @property
    def number_of_pruned_nodes(self) -> int:
        return len(self.pruned_nodes)

    @property
    def number_of_pruned_relationships(self) -> int:
        return len(self.pruned_relationships)

    @property
    def number_of_pruned_properties(self) -> int:
        return len(self.pruned_properties)

    def __str__(self) -> str:
        return (
            f"PruningStats: nodes: {self.number_of_pruned_nodes}, "
            f"relationships: {self.number_of_pruned_relationships}, "
            f"properties: {self.number_of_pruned_properties}"
        )

    def add_pruned_node(
        self, node: Neo4jNode, reason: PruningReason, **kwargs: Any
    ) -> None:
        self.pruned_nodes.append(
            PrunedItem(
                label=node.label, item=node, pruned_reason=reason, metadata=kwargs
            )
        )

    def add_pruned_relationship(
        self, relationship: Neo4jRelationship, reason: PruningReason, **kwargs: Any
    ) -> None:
        self.pruned_relationships.append(
            PrunedItem(
                label=relationship.type,
                item=relationship,
                pruned_reason=reason,
                metadata=kwargs,
            )
        )

    def add_pruned_property(
        self, prop: str, label: str, reason: PruningReason, **kwargs: Any
    ) -> None:
        self.pruned_properties.append(
            PrunedItem(label=label, item=prop, pruned_reason=reason, metadata=kwargs)
        )

    def add_pruned_item(
        self,
        item: Union[Neo4jNode, Neo4jRelationship],
        reason: PruningReason,
        **kwargs: Any,
    ) -> None:
        if isinstance(item, Neo4jNode):
            self.add_pruned_node(
                item,
                reason=reason,
                **kwargs,
            )
        else:
            self.add_pruned_relationship(
                item,
                reason=reason,
                **kwargs,
            )


class GraphPruningResult(DataModel):
    graph: Neo4jGraph
    pruning_stats: PruningStats


class GraphPruning(Component):
    @validate_call
    async def run(
        self,
        graph: Neo4jGraph,
        schema: Optional[GraphSchema] = None,
        lexical_graph_config: Optional[LexicalGraphConfig] = None,
    ) -> GraphPruningResult:
        if lexical_graph_config is None:
            lexical_graph_config = LexicalGraphConfig()
        if schema is not None:
            new_graph, pruning_stats = self._clean_graph(
                graph, schema, lexical_graph_config
            )
        else:
            new_graph = graph
            pruning_stats = PruningStats()
        return GraphPruningResult(
            graph=new_graph,
            pruning_stats=pruning_stats,
        )

    def _clean_graph(
        self,
        graph: Neo4jGraph,
        schema: GraphSchema,
        lexical_graph_config: LexicalGraphConfig,
    ) -> tuple[Neo4jGraph, PruningStats]:
        """
        Verify that the graph conforms to the provided schema.

        Remove invalid entities,relationships, and properties.
        If an entity is removed, all of its relationships are also removed.
        If no valid properties remain for an entity, remove that entity.
        """
        pruning_stats = PruningStats()
        filtered_nodes = self._enforce_nodes(
            graph.nodes,
            schema,
            lexical_graph_config,
            pruning_stats,
        )
        if not filtered_nodes:
            logger.warning(
                "PRUNING: all nodes were pruned, resulting graph will be empty. Check logs for details."
            )
            return Neo4jGraph(), pruning_stats

        filtered_rels = self._enforce_relationships(
            graph.relationships,
            filtered_nodes,
            schema,
            lexical_graph_config,
            pruning_stats,
        )

        return (
            Neo4jGraph(nodes=filtered_nodes, relationships=filtered_rels),
            pruning_stats,
        )

    def _validate_node(
        self,
        node: Neo4jNode,
        pruning_stats: PruningStats,
        schema_entity: Optional[NodeType],
        additional_node_types: bool,
    ) -> Optional[Neo4jNode]:
        if not node.label:
            pruning_stats.add_pruned_node(node, reason=PruningReason.MISSING_LABEL)
            return None
        if not node.id:
            pruning_stats.add_pruned_node(
                node,
                reason=PruningReason.MISSING_REQUIRED_PROPERTY,
                missing_required_properties=["id"],
                details="The node was extracted without a valid ID.",
            )
            return None
        if not schema_entity:
            # node type not declared in the schema
            if additional_node_types:
                # keep node as it is as we do not have any additional info
                return node
            # it's not in schema
            pruning_stats.add_pruned_node(node, reason=PruningReason.NOT_IN_SCHEMA)
            return None
        filtered_props = self._enforce_properties(
            node,
            schema_entity,
            pruning_stats,
            prune_empty=True,
        )
        if not filtered_props:
            return None
        return Neo4jNode(
            id=node.id,
            label=node.label,
            properties=filtered_props,
            embedding_properties=node.embedding_properties,
        )

    def _enforce_nodes(
        self,
        nodes: list[Neo4jNode],
        schema: GraphSchema,
        lexical_graph_config: LexicalGraphConfig,
        pruning_stats: PruningStats,
    ) -> list[Neo4jNode]:
        """
        Filter nodes to be conformant to the schema.

        Keep only those whose label is in schema
        (unless schema has additional_node_types=True, default value)
        For each valid node, validate properties. If a node is left without
        properties, prune it.
        """
        valid_nodes = []
        for node in nodes:
            if node.label in lexical_graph_config.lexical_graph_node_labels:
                valid_nodes.append(node)
                continue
            schema_entity = schema.node_type_from_label(node.label)
            new_node = self._validate_node(
                node,
                pruning_stats,
                schema_entity,
                additional_node_types=schema.additional_node_types,
            )
            if new_node:
                valid_nodes.append(new_node)
        return valid_nodes

    def _validate_relationship(
        self,
        rel: Neo4jRelationship,
        valid_nodes: dict[str, str],
        pruning_stats: PruningStats,
        relationship_type: Optional[RelationshipType],
        additional_relationship_types: bool,
        patterns: tuple[Pattern, ...],
        additional_patterns: bool,
    ) -> Optional[Neo4jRelationship]:
        if not rel.type:
            pruning_stats.add_pruned_relationship(
                rel, reason=PruningReason.MISSING_LABEL
            )
            return None
        # validate start/end node IDs are valid nodes
        if rel.start_node_id not in valid_nodes or rel.end_node_id not in valid_nodes:
            logger.debug(
                f"PRUNING:: {rel} as one of {rel.start_node_id} or {rel.end_node_id} is not a valid node"
            )
            pruning_stats.add_pruned_relationship(
                rel, reason=PruningReason.INVALID_START_OR_END_NODE
            )
            return None

        # validate relationship type
        if relationship_type is None:
            if not additional_relationship_types:
                logger.debug(
                    f"PRUNING:: {rel} as {rel.type} is not in the schema and `additional_relationship_types` is False"
                )
                pruning_stats.add_pruned_relationship(
                    rel, reason=PruningReason.NOT_IN_SCHEMA
                )
                return None

        # validate pattern
        tuple_valid = True
        reverse_tuple_valid = False
        if patterns and relationship_type:
            start_label = valid_nodes[rel.start_node_id]
            end_label = valid_nodes[rel.end_node_id]
            tuple_valid = (start_label, rel.type, end_label) in patterns
            # try to reverse relationship only if initial order is not valid
            reverse_tuple_valid = (
                not tuple_valid
                and (
                    end_label,
                    rel.type,
                    start_label,
                )
                in patterns
            )

        if not tuple_valid and not reverse_tuple_valid and not additional_patterns:
            logger.debug(f"PRUNING:: {rel} not in the allowed patterns")
            pruning_stats.add_pruned_relationship(
                rel, reason=PruningReason.INVALID_PATTERN
            )
            return None

        # filter properties if we can
        if relationship_type is not None:
            filtered_props = self._enforce_properties(
                rel,
                relationship_type,
                pruning_stats,
                prune_empty=False,
            )
        else:
            filtered_props = rel.properties

        return Neo4jRelationship(
            start_node_id=rel.end_node_id if reverse_tuple_valid else rel.start_node_id,
            end_node_id=rel.start_node_id if reverse_tuple_valid else rel.end_node_id,
            type=rel.type,
            properties=filtered_props,
            embedding_properties=rel.embedding_properties,
        )

    def _enforce_relationships(
        self,
        relationships: list[Neo4jRelationship],
        filtered_nodes: list[Neo4jNode],
        schema: GraphSchema,
        lexical_graph_config: LexicalGraphConfig,
        pruning_stats: PruningStats,
    ) -> list[Neo4jRelationship]:
        """
        Filter relationships to be conformant to the schema.

        Keep only those whose types are in schema, start/end node conform to schema,
        and start/end nodes are in filtered nodes (i.e., kept after node enforcement).
        For each valid relationship, filter out properties not present in the schema.

        If a relationship direction is incorrect, invert it.
        """

        valid_rels = []
        valid_nodes = {node.id: node.label for node in filtered_nodes}
        for rel in relationships:
            if rel.type in lexical_graph_config.lexical_graph_relationship_types:
                # Need to validate start/end nodes exist for lexical relationships
                if rel.start_node_id in valid_nodes and rel.end_node_id in valid_nodes:
                    valid_rels.append(rel)
                else:
                    logger.debug(
                        f"PRUNING:: Lexical relationship {rel} as one of {rel.start_node_id} or {rel.end_node_id} is not a valid node"
                    )
                    pruning_stats.add_pruned_relationship(
                        rel, reason=PruningReason.INVALID_START_OR_END_NODE
                    )
                continue
            schema_relation = schema.relationship_type_from_label(rel.type)
            new_rel = self._validate_relationship(
                rel,
                valid_nodes,
                pruning_stats,
                schema_relation,
                schema.additional_relationship_types,
                schema.patterns,
                schema.additional_patterns,
            )
            if new_rel:
                valid_rels.append(new_rel)
        return valid_rels

    def _enforce_properties(
        self,
        item: Union[Neo4jNode, Neo4jRelationship],
        schema_item: Union[NodeType, RelationshipType],
        pruning_stats: PruningStats,
        prune_empty: bool = False,
    ) -> dict[str, Any]:
        """
        Enforce properties:
        - Ensure property type: for now, just prevent having invalid property types (e.g. map)
        - Filter out those that are not in schema (i.e., valid properties) if allowed properties is False.
        - Check that all required properties are present and not null.
        """
        type_safe_properties = self._ensure_property_types(
            item.properties,
        )
        filtered_properties = self._filter_properties(
            type_safe_properties,
            schema_item.properties,
            schema_item.additional_properties,
            item.token,  # label or type
            pruning_stats,
        )
        if not filtered_properties and prune_empty:
            pruning_stats.add_pruned_item(item, reason=PruningReason.NO_PROPERTY_LEFT)
            return filtered_properties
        missing_required_properties = self._check_required_properties(
            filtered_properties,
            valid_properties=schema_item.properties,
        )
        if missing_required_properties:
            pruning_stats.add_pruned_item(
                item,
                reason=PruningReason.MISSING_REQUIRED_PROPERTY,
                missing_required_properties=missing_required_properties,
            )
            return {}
        return filtered_properties

    def _filter_properties(
        self,
        properties: dict[str, Any],
        valid_properties: list[PropertyType],
        additional_properties: bool,
        node_label: str,
        pruning_stats: PruningStats,
    ) -> dict[str, Any]:
        """Filters out properties not in schema if additional_properties is False"""
        if additional_properties:
            # we do not need to filter any property, just return the initial properties
            return properties
        valid_prop_names = {prop.name for prop in valid_properties}
        filtered_properties = {}
        for prop_name, prop_value in properties.items():
            if prop_name not in valid_prop_names:
                pruning_stats.add_pruned_property(
                    prop_name,
                    node_label,
                    reason=PruningReason.NOT_IN_SCHEMA,
                    value=prop_value,
                )
                continue
            filtered_properties[prop_name] = prop_value
        return filtered_properties

    def _check_required_properties(
        self, filtered_properties: dict[str, Any], valid_properties: list[PropertyType]
    ) -> list[str]:
        """Returns the list of missing required properties, if any."""
        required_prop_names = {prop.name for prop in valid_properties if prop.required}
        missing_required_properties = []
        for req_prop in required_prop_names:
            if filtered_properties.get(req_prop) is None:
                missing_required_properties.append(req_prop)
        return missing_required_properties

    def _ensure_property_types(
        self,
        filtered_properties: dict[str, Any],
    ) -> dict[str, Any]:
        type_safe_properties = {}
        for prop_name, prop_value in filtered_properties.items():
            if isinstance(prop_value, dict):
                # just ensure the type will not raise error on insert, while preserving data
                type_safe_properties[prop_name] = json.dumps(prop_value, default=str)
                continue

            # this is where we could check types of other properties
            # but keep it simple for now
            type_safe_properties[prop_name] = prop_value
        return type_safe_properties
