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
from __future__ import annotations

import json
import re

import neo4j
import logging
import warnings
from typing import (
    Any,
    Dict,
    Iterator,
    List,
    Literal,
    Optional,
    Tuple,
    Union,
    Sequence,
    Callable,
    cast,
)
from pathlib import Path

from pydantic import (
    BaseModel,
    PrivateAttr,
    model_validator,
    validate_call,
    ConfigDict,
    ValidationError,
    Field,
)
from typing_extensions import Self

from neo4j_graphrag.exceptions import (
    SchemaValidationError,
    LLMGenerationError,
    SchemaExtractionError,
)
from neo4j_graphrag.experimental.pipeline.component import Component, DataModel
from neo4j_graphrag.experimental.pipeline.types.schema import (
    EntityInputType,
    RelationInputType,
)
from neo4j_graphrag.generation import SchemaExtractionTemplate, PromptTemplate
from neo4j_graphrag.llm import LLMInterface
from neo4j_graphrag.types import LLMMessage
from neo4j_graphrag.utils.file_handler import FileHandler, FileFormat
from neo4j_graphrag.schema import get_structured_schema


logger = logging.getLogger(__name__)


class PropertyType(BaseModel):
    """
    Represents a property on a node or relationship in the graph.
    """

    name: str
    # See https://neo4j.com/docs/cypher-manual/current/values-and-types/property-structural-constructed/#property-types
    type: Literal[
        "BOOLEAN",
        "DATE",
        "DURATION",
        "FLOAT",
        "INTEGER",
        "LIST",
        "LOCAL_DATETIME",
        "LOCAL_TIME",
        "POINT",
        "STRING",
        "ZONED_DATETIME",
        "ZONED_TIME",
    ]
    description: str = ""
    required: bool = False
    model_config = ConfigDict(
        frozen=True,
    )


def default_additional_item(key: str) -> Callable[[dict[str, Any]], bool]:
    def wrapper(validated_data: dict[str, Any]) -> bool:
        return len(validated_data.get(key, [])) == 0

    return wrapper


class NodeType(BaseModel):
    """
    Represents a possible node in the graph.
    """

    label: str
    description: str = ""
    properties: list[PropertyType] = Field(default_factory=list, min_length=1)
    additional_properties: bool = Field(
        default_factory=default_additional_item("properties")
    )

    @model_validator(mode="before")
    @classmethod
    def validate_input_if_string(cls, data: EntityInputType) -> EntityInputType:
        if isinstance(data, str):
            logger.info(
                f"Converting string '{data}' to NodeType with default 'name' property "
                f"and additional_properties=True to allow flexible property extraction."
            )
            return {
                "label": data,
                # added to satisfy the model validation (min_length=1 for properties of node types)
                "properties": [{"name": "name", "type": "STRING"}],
                # allow LLM to extract additional properties beyond the default "name"
                "additional_properties": True,  # type: ignore[dict-item]
            }
        return data

    @model_validator(mode="after")
    def validate_additional_properties(self) -> Self:
        if len(self.properties) == 0 and not self.additional_properties:
            raise ValueError(
                "Using `additional_properties=False` with no defined "
                "properties will cause the model to be pruned during graph cleaning. "
                f"Define some properties or remove this NodeType: {self}"
            )
        return self

    def property_type_from_name(self, name: str) -> Optional[PropertyType]:
        for prop in self.properties:
            if prop.name == name:
                return prop
        return None


class RelationshipType(BaseModel):
    """
    Represents a possible relationship between nodes in the graph.
    """

    label: str
    description: str = ""
    properties: list[PropertyType] = []
    additional_properties: bool = Field(
        default_factory=default_additional_item("properties")
    )

    @model_validator(mode="before")
    @classmethod
    def validate_input_if_string(cls, data: RelationInputType) -> RelationInputType:
        if isinstance(data, str):
            return {"label": data}
        return data

    @model_validator(mode="after")
    def validate_additional_properties(self) -> Self:
        if len(self.properties) == 0 and not self.additional_properties:
            logger.info(
                f"Auto-correcting RelationshipType '{self.label}': "
                f"Setting additional_properties=True because properties list is empty. "
                f"This allows the LLM to extract properties during graph construction."
            )
            self.additional_properties = True
        return self

    def property_type_from_name(self, name: str) -> Optional[PropertyType]:
        for prop in self.properties:
            if prop.name == name:
                return prop
        return None


class ConstraintType(BaseModel):
    """
    Represents a constraint on a node in the graph.
    """

    type: Literal[
        "UNIQUENESS"
    ]  # TODO: add other constraint types ["propertyExistence", "propertyType", "key"]
    node_type: str
    property_name: str

    model_config = ConfigDict(
        frozen=True,
    )


class Pattern(BaseModel):
    """Represents a relationship pattern in the graph schema.

    This model provides backward compatibility with tuple-based patterns
    through helper methods (__iter__, __getitem__, __eq__, __hash__).
    """

    source: str
    relationship: str
    target: str

    model_config = ConfigDict(frozen=True)

    def __iter__(self) -> Iterator[str]:  # type: ignore[override]
        """Allow unpacking: source, rel, target = pattern"""
        return iter((self.source, self.relationship, self.target))

    def __getitem__(self, index: int) -> str:
        """Allow indexing: pattern[0] returns source"""
        return (self.source, self.relationship, self.target)[index]

    def __eq__(self, other: object) -> bool:
        """Allow comparison with tuples for backward compatibility."""
        if isinstance(other, Pattern):
            return (
                self.source,
                self.relationship,
                self.target,
            ) == (
                other.source,
                other.relationship,
                other.target,
            )
        if isinstance(other, (tuple, list)) and len(other) == 3:
            return (self.source, self.relationship, self.target) == tuple(other)
        return False

    def __hash__(self) -> int:
        return hash((self.source, self.relationship, self.target))


class GraphSchema(DataModel):
    """This model represents the expected
    node and relationship types in the graph.

    It is used both for guiding the LLM in the entity and relation
    extraction component, and for cleaning the extracted graph in a
    post-processing step.

    .. warning::

        This model is immutable.
    """

    node_types: Tuple[NodeType, ...]
    relationship_types: Tuple[RelationshipType, ...] = tuple()
    patterns: Tuple[Pattern, ...] = tuple()
    constraints: Tuple[ConstraintType, ...] = tuple()

    additional_node_types: bool = Field(
        default_factory=default_additional_item("node_types")
    )
    additional_relationship_types: bool = Field(
        default_factory=default_additional_item("relationship_types")
    )
    additional_patterns: bool = Field(
        default_factory=default_additional_item("patterns")
    )

    _node_type_index: dict[str, NodeType] = PrivateAttr()
    _relationship_type_index: dict[str, RelationshipType] = PrivateAttr()

    model_config = ConfigDict(
        frozen=True,
    )

    @model_validator(mode="before")
    @classmethod
    def convert_tuple_patterns(cls, data: Any) -> Any:
        """Convert tuple patterns to Pattern objects for backward compatibility."""
        if isinstance(data, dict) and "patterns" in data and data["patterns"]:
            patterns = data["patterns"]
            converted = []
            for p in patterns:
                if isinstance(p, (tuple, list)) and len(p) == 3:
                    converted.append(
                        Pattern(source=p[0], relationship=p[1], target=p[2])
                    )
                else:
                    converted.append(p)
            data["patterns"] = converted
        return data

    @model_validator(mode="after")
    def validate_patterns_against_node_and_rel_types(self) -> Self:
        self._node_type_index = {node.label: node for node in self.node_types}
        self._relationship_type_index = (
            {r.label: r for r in self.relationship_types}
            if self.relationship_types
            else {}
        )

        relationship_types = self.relationship_types
        patterns = self.patterns

        if patterns:
            if not relationship_types:
                raise SchemaValidationError(
                    "Relationship types must also be provided when using patterns."
                )
            for entity1, relation, entity2 in patterns:
                if entity1 not in self._node_type_index:
                    raise SchemaValidationError(
                        f"Node type '{entity1}' is not defined in the provided node_types."
                    )
                if relation not in self._relationship_type_index:
                    raise SchemaValidationError(
                        f"Relationship type '{relation}' is not defined in the provided relationship_types."
                    )
                if entity2 not in self._node_type_index:
                    raise ValueError(
                        f"Node type '{entity2}' is not defined in the provided node_types."
                    )

        return self

    @model_validator(mode="after")
    def validate_additional_parameters(self) -> Self:
        if (
            self.additional_patterns is False
            and self.additional_relationship_types is True
        ):
            raise ValueError(
                "`additional_relationship_types` must be set to False when using `additional_patterns=False`"
            )
        return self

    @model_validator(mode="after")
    def validate_constraints_against_node_types(self) -> Self:
        if not self.constraints:
            return self
        for constraint in self.constraints:
            # Only validate UNIQUENESS constraints (other types will be added)
            if constraint.type != "UNIQUENESS":
                continue

            if not constraint.property_name:
                raise SchemaValidationError(
                    f"Constraint has no property name: {constraint}. Property name is required."
                )
            if constraint.node_type not in self._node_type_index:
                raise SchemaValidationError(
                    f"Constraint references undefined node type: {constraint.node_type}"
                )
            # Check if property_name exists on the node type
            node_type = self._node_type_index[constraint.node_type]
            valid_property_names = {p.name for p in node_type.properties}
            if constraint.property_name not in valid_property_names:
                raise SchemaValidationError(
                    f"Constraint references undefined property '{constraint.property_name}' "
                    f"on node type '{constraint.node_type}'. "
                    f"Valid properties: {valid_property_names}"
                )
        return self

    def node_type_from_label(self, label: str) -> Optional[NodeType]:
        return self._node_type_index.get(label)

    def relationship_type_from_label(self, label: str) -> Optional[RelationshipType]:
        return self._relationship_type_index.get(label)

    @classmethod
    def model_json_schema(cls, **kwargs: Any) -> dict[str, Any]:  # type: ignore[override]
        """Override for structured output compatibility.

        OpenAI requires:
        - additionalProperties: false on all objects
        - All properties must be in required array

        VertexAI requires:
        - No 'const' keyword (convert to enum with single value)
        """
        schema = super().model_json_schema(**kwargs)

        def make_strict(obj: dict[str, Any]) -> None:
            """Recursively set additionalProperties, required, and fix const."""
            if obj.get("type") == "object" and "properties" in obj:
                obj["additionalProperties"] = False
                obj["required"] = list(obj["properties"].keys())

            # Convert 'const' to 'enum' for VertexAI compatibility
            if "const" in obj:
                obj["enum"] = [obj.pop("const")]

            for value in obj.values():
                if isinstance(value, dict):
                    make_strict(value)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            make_strict(item)

        make_strict(schema)
        if "$defs" in schema:
            for def_schema in schema["$defs"].values():
                make_strict(def_schema)

        return schema

    @classmethod
    def create_empty(cls) -> Self:
        return cls(node_types=tuple())

    def save(
        self,
        file_path: Union[str, Path],
        overwrite: bool = False,
        format: Optional[FileFormat] = None,
    ) -> None:
        """
        Save the schema configuration to file.

        Args:
            file_path (str): The path where the schema configuration will be saved.
            overwrite (bool): If set to True, existing file will be overwritten. Default to False.
            format (Optional[FileFormat]): The file format to save the schema configuration into. By default, it is inferred from file_path extension.
        """
        data = self.model_dump(mode="json")
        file_handler = FileHandler()
        file_handler.write(data, file_path, overwrite=overwrite, format=format)

    def store_as_json(
        self, file_path: Union[str, Path], overwrite: bool = False
    ) -> None:
        warnings.warn(
            "Use .save(..., format=FileFormat.JSON) instead.", DeprecationWarning
        )
        return self.save(file_path, overwrite=overwrite, format=FileFormat.JSON)

    def store_as_yaml(
        self, file_path: Union[str, Path], overwrite: bool = False
    ) -> None:
        warnings.warn(
            "Use .save(..., format=FileFormat.YAML) instead.", DeprecationWarning
        )
        return self.save(file_path, overwrite=overwrite, format=FileFormat.YAML)

    @classmethod
    def from_file(
        cls, file_path: Union[str, Path], format: Optional[FileFormat] = None
    ) -> Self:
        """
        Load a schema configuration from a file (either JSON or YAML).

        The file format is automatically detected based on the file extension,
        unless the format parameter is set.

        Args:
            file_path (Union[str, Path]): The path to the schema configuration file.
            format (Optional[FileFormat]): The format of the schema configuration file (json or yaml).

        Returns:
            GraphSchema: The loaded schema configuration.
        """
        file_path = Path(file_path)
        file_handler = FileHandler()
        try:
            data = file_handler.read(file_path, format=format)
        except ValueError:
            raise

        try:
            return cls.model_validate(data)
        except ValidationError as e:
            raise SchemaValidationError(str(e)) from e


class BaseSchemaBuilder(Component):
    async def run(self, *args: Any, **kwargs: Any) -> GraphSchema:
        raise NotImplementedError()


class SchemaBuilder(BaseSchemaBuilder):
    """
    A builder class for constructing GraphSchema objects from given entities,
    relations, and their interrelationships defined in a potential schema.

    Example:

    .. code-block:: python

        from neo4j_graphrag.experimental.components.schema import (
            SchemaBuilder,
            NodeType,
            PropertyType,
            RelationshipType,
        )
        from neo4j_graphrag.experimental.pipeline import Pipeline

        node_types = [
            NodeType(
                label="PERSON",
                description="An individual human being.",
                properties=[
                    PropertyType(
                        name="name", type="STRING", description="The name of the person"
                    )
                ],
            ),
            NodeType(
                label="ORGANIZATION",
                description="A structured group of people with a common purpose.",
                properties=[
                    PropertyType(
                        name="name", type="STRING", description="The name of the organization"
                    )
                ],
            ),
        ]
        relationship_types = [
            RelationshipType(
                label="EMPLOYED_BY", description="Indicates employment relationship."
            ),
        ]
        patterns = [
            ("PERSON", "EMPLOYED_BY", "ORGANIZATION"),
        ]
        pipe = Pipeline()
        schema_builder = SchemaBuilder()
        pipe.add_component(schema_builder, "schema_builder")
        pipe_inputs = {
            "schema": {
                "node_types": node_types,
                "relationship_types": relationship_types,
                "patterns": patterns,
            },
            ...
        }
        pipe.run(pipe_inputs)
    """

    @staticmethod
    def create_schema_model(
        node_types: Sequence[NodeType],
        relationship_types: Optional[Sequence[RelationshipType]] = None,
        patterns: Optional[Sequence[Union[Tuple[str, str, str], Pattern]]] = None,
        constraints: Optional[Sequence[ConstraintType]] = None,
        **kwargs: Any,
    ) -> GraphSchema:
        """
        Creates a GraphSchema object from Lists of Entity and Relation objects
        and a Dictionary defining potential relationships.

        Args:
            node_types (Sequence[NodeType]): List or tuple of NodeType objects.
            relationship_types (Optional[Sequence[RelationshipType]]): List or tuple of RelationshipType objects.
            patterns (Optional[Sequence[Tuple[str, str, str]]]): List or tuples of triplets: (source_entity_label, relation_label, target_entity_label).
            kwargs: other arguments passed to GraphSchema validator.

        Returns:
            GraphSchema: A configured schema object.
        """
        try:
            return GraphSchema.model_validate(
                dict(
                    node_types=node_types,
                    relationship_types=relationship_types or (),
                    patterns=patterns or (),
                    constraints=constraints or (),
                    **kwargs,
                )
            )
        except ValidationError as e:
            raise SchemaValidationError() from e

    @validate_call
    async def run(
        self,
        node_types: Sequence[NodeType],
        relationship_types: Optional[Sequence[RelationshipType]] = None,
        patterns: Optional[Sequence[Union[Tuple[str, str, str], Pattern]]] = None,
        constraints: Optional[Sequence[ConstraintType]] = None,
        **kwargs: Any,
    ) -> GraphSchema:
        """
        Asynchronously constructs and returns a GraphSchema object.

        Args:
            node_types (Sequence[NodeType]): Sequence of NodeType objects.
            relationship_types (Sequence[RelationshipType]): Sequence of RelationshipType objects.
            patterns (Optional[Sequence[Tuple[str, str, str]]]): Sequence of triplets: (source_entity_label, relation_label, target_entity_label).

        Returns:
            GraphSchema: A configured schema object, constructed asynchronously.
        """
        return self.create_schema_model(
            node_types,
            relationship_types,
            patterns,
            constraints,
            **kwargs,
        )


class SchemaFromTextExtractor(BaseSchemaBuilder):
    """
    A component for constructing GraphSchema objects from the output of an LLM after
    automatic schema extraction from text.

    Args:
        llm (LLMInterface): The language model to use for schema extraction.
        prompt_template (Optional[PromptTemplate]): A custom prompt template to use for extraction.
        llm_params (Optional[Dict[str, Any]]): Additional parameters passed to the LLM.
        use_structured_output (bool): Whether to use structured output (LLMInterfaceV2) with the GraphSchema Pydantic model.
            Only supported for OpenAILLM and VertexAILLM. Defaults to False (uses V1 prompt-based JSON extraction).

    Example with V1 (default, prompt-based JSON):

    .. code-block:: python

        from neo4j_graphrag.experimental.components.schema import SchemaFromTextExtractor
        from neo4j_graphrag.llm import OpenAILLM

        llm = OpenAILLM(model_name="gpt-5", model_params={"temperature": 0})
        extractor = SchemaFromTextExtractor(llm=llm)

    Example with V2 (structured output):

    .. code-block:: python

        from neo4j_graphrag.experimental.components.schema import SchemaFromTextExtractor
        from neo4j_graphrag.llm import OpenAILLM

        llm = OpenAILLM(model_name="gpt-5")
        extractor = SchemaFromTextExtractor(llm=llm, use_structured_output=True)
    """

    def __init__(
        self,
        llm: LLMInterface,
        prompt_template: Optional[PromptTemplate] = None,
        llm_params: Optional[Dict[str, Any]] = None,
        use_structured_output: bool = False,
    ) -> None:
        self._llm: LLMInterface = llm
        self._prompt_template: PromptTemplate = (
            prompt_template or SchemaExtractionTemplate()
        )
        self._llm_params: dict[str, Any] = llm_params or {}
        self.use_structured_output = use_structured_output

        # Validate that structured output is only used with supported LLMs
        if use_structured_output and not llm.supports_structured_output:
            raise ValueError(
                f"Structured output is not supported by {type(llm).__name__}. "
                f"Please use a model that supports structured output, or set use_structured_output=False."
            )

    def _filter_invalid_patterns(
        self,
        patterns: List[Tuple[str, str, str]],
        node_types: List[Dict[str, Any]],
        relationship_types: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Tuple[str, str, str]]:
        """
        Filter out patterns that reference undefined node types or relationship types.

        Args:
            patterns: List of patterns to filter.
            node_types: List of node type definitions.
            relationship_types: Optional list of relationship type definitions.

        Returns:
            Filtered list of patterns containing only valid references.
        """
        # Early returns for missing required types
        if not node_types:
            logging.info(
                "Filtering out all patterns because no node types are defined. "
                "Patterns reference node types that must be defined."
            )
            return []

        if not relationship_types:
            logging.info(
                "Filtering out all patterns because no relationship types are defined. "
                "GraphSchema validation requires relationship_types when patterns are provided."
            )
            return []

        # Create sets of valid labels
        valid_node_labels = {node_type["label"] for node_type in node_types}
        valid_relationship_labels = {
            rel_type["label"] for rel_type in relationship_types
        }

        # Filter patterns
        filtered_patterns = []
        for pattern in patterns:
            # Extract components based on pattern type
            if isinstance(pattern, dict):
                if not all(k in pattern for k in ("source", "relationship", "target")):
                    continue
                entity1 = pattern["source"]
                relation = pattern["relationship"]
                entity2 = pattern["target"]
            elif isinstance(pattern, (list, tuple)):
                if len(pattern) != 3:
                    continue
                entity1, relation, entity2 = pattern
            elif isinstance(pattern, Pattern):
                entity1, relation, entity2 = pattern  # Uses Pattern.__iter__
            else:
                continue

            # Check if all components are valid
            if (
                entity1 in valid_node_labels
                and entity2 in valid_node_labels
                and relation in valid_relationship_labels
            ):
                filtered_patterns.append(pattern)
            else:
                # Log invalid pattern with validation details
                entity1_valid = entity1 in valid_node_labels
                entity2_valid = entity2 in valid_node_labels
                relation_valid = relation in valid_relationship_labels

                logging.info(
                    f"Filtering out invalid pattern: {pattern}. "
                    f"Entity1 '{entity1}' valid: {entity1_valid}, "
                    f"Entity2 '{entity2}' valid: {entity2_valid}, "
                    f"Relation '{relation}' valid: {relation_valid}"
                )

        return filtered_patterns

    def _filter_items_without_labels(
        self, items: List[Dict[str, Any]], item_type: str
    ) -> List[Dict[str, Any]]:
        """Filter out items that have no valid labels."""
        filtered_items = []
        for item in items:
            if isinstance(item, str):
                if item and " " not in item and not item.startswith("{"):
                    # Add default property for node types to satisfy min_length=1 constraint
                    # This matches the behavior of NodeType.validate_input_if_string
                    if item_type == "node type":
                        filtered_items.append(
                            {
                                "label": item,
                                "properties": [{"name": "name", "type": "STRING"}],
                                "additional_properties": True,
                            }
                        )
                    else:
                        filtered_items.append({"label": item})
                elif item:
                    logging.info(
                        f"Filtering out {item_type} with invalid label: {item}"
                    )
            elif isinstance(item, dict) and item.get("label"):
                filtered_items.append(item)
            else:
                logging.info(f"Filtering out {item_type} with missing label: {item}")
        return filtered_items

    def _filter_nodes_without_labels(
        self, node_types: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Filter out node types that have no labels."""
        return self._filter_items_without_labels(node_types, "node type")

    def _filter_relationships_without_labels(
        self, relationship_types: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Filter out relationship types that have no labels."""
        return self._filter_items_without_labels(
            relationship_types, "relationship type"
        )

    def _apply_cross_reference_filters(
        self,
        extracted_node_types: List[Dict[str, Any]],
        extracted_relationship_types: Optional[List[Dict[str, Any]]],
        extracted_patterns: Any,
        extracted_constraints: Optional[List[Dict[str, Any]]],
    ) -> tuple[Any, Optional[List[Dict[str, Any]]]]:
        """Apply cross-reference filtering for patterns and constraints.

        This filtering is common to both V1 and V2 paths and handles:
        - Filtering out patterns that reference non-existent nodes/relationships
        - Enforcing required=True for properties with UNIQUENESS constraints
        - Filtering out invalid constraints

        Args:
            extracted_node_types: List of node type dictionaries
            extracted_relationship_types: Optional list of relationship type dictionaries
            extracted_patterns: Patterns in any format (dicts, tuples, lists, Pattern objects)
            extracted_constraints: Optional list of constraint dictionaries

        Returns:
            Tuple of (filtered_patterns, filtered_constraints)
        """
        # Filter out invalid patterns before validation
        if extracted_patterns:
            extracted_patterns = self._filter_invalid_patterns(
                extracted_patterns,
                extracted_node_types,
                extracted_relationship_types,
            )

        # Enforce required=true for properties with UNIQUENESS constraints
        if extracted_constraints:
            self._enforce_required_for_constraint_properties(
                extracted_node_types, extracted_constraints
            )

        # Filter out invalid constraints
        if extracted_constraints:
            extracted_constraints = self._filter_invalid_constraints(
                extracted_constraints, extracted_node_types
            )

        return extracted_patterns, extracted_constraints

    def _filter_invalid_constraints(
        self, constraints: List[Dict[str, Any]], node_types: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Filter out constraints that reference undefined node types, have no property name, are not UNIQUENESS type
        or reference a property that doesn't exist on the node type."""
        if not constraints:
            return []

        if not node_types:
            logging.info(
                "Filtering out all constraints because no node types are defined. "
                "Constraints reference node types that must be defined."
            )
            return []

        # Build a mapping of node_type label -> set of property names
        node_type_properties: Dict[str, set[str]] = {}
        for node_type_dict in node_types:
            label = node_type_dict.get("label")
            if label:
                properties = node_type_dict.get("properties", [])
                property_names = {p.get("name") for p in properties if p.get("name")}
                node_type_properties[label] = property_names

        valid_node_labels = set(node_type_properties.keys())

        filtered_constraints = []
        for constraint in constraints:
            # Only process UNIQUENESS constraints (other types will be added)
            if constraint.get("type") != "UNIQUENESS":
                logging.info(
                    f"Filtering out constraint: {constraint}. "
                    f"Only UNIQUENESS constraints are supported."
                )
                continue

            # check if the property_name is provided
            if not constraint.get("property_name"):
                logging.info(
                    f"Filtering out constraint: {constraint}. "
                    f"Property name is not provided."
                )
                continue
            # check if the node_type is valid
            node_type = constraint.get("node_type")
            if node_type not in valid_node_labels:
                logging.info(
                    f"Filtering out constraint: {constraint}. "
                    f"Node type '{node_type}' is not valid. Valid node types: {valid_node_labels}"
                )
                continue
            # check if the property_name exists on the node type
            property_name = constraint.get("property_name")
            if property_name not in node_type_properties.get(node_type, set()):
                logging.info(
                    f"Filtering out constraint: {constraint}. "
                    f"Property '{property_name}' does not exist on node type '{node_type}'. "
                    f"Valid properties: {node_type_properties.get(node_type, set())}"
                )
                continue
            filtered_constraints.append(constraint)
        return filtered_constraints

    def _filter_properties_required_field(
        self, node_types: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Sanitize the 'required' field in node type properties. Ensures 'required' is a valid boolean.
        converts known string values (true, yes, 1, false, no, 0) to booleans and removes unrecognized values.
        """
        for node_type in node_types:
            properties = node_type.get("properties", [])
            if not properties:
                continue
            for prop in properties:
                if not isinstance(prop, dict):
                    continue

                required_value = prop.get("required")

                #  Not provided - will use Pydantic default (false)
                if required_value is None:
                    continue

                # already a valid boolean
                if isinstance(required_value, bool):
                    continue

                prop_name = prop.get("name", "unknown")
                node_label = node_type.get("label", "unknown")

                # Convert to string to handle int values like 1 or 0
                required_str = str(required_value).lower()

                if required_str in ("true", "yes", "1"):
                    prop["required"] = True
                    logging.info(
                        f"Converted 'required' value '{required_value}' to True "
                        f"for property '{prop_name}' on node '{node_label}'"
                    )
                elif required_str in ("false", "no", "0"):
                    prop["required"] = False
                    logging.info(
                        f"Converted 'required' value '{required_value}' to False "
                        f"for property '{prop_name}' on node '{node_label}'"
                    )
                else:
                    logging.info(
                        f"Removing unrecognized 'required' value '{required_value}' "
                        f"for property '{prop_name}' on node '{node_label}'. "
                        f"Using default (False)."
                    )
                    prop.pop("required", None)

        return node_types

    def _enforce_required_for_constraint_properties(
        self,
        node_types: List[Dict[str, Any]],
        constraints: List[Dict[str, Any]],
    ) -> None:
        """Ensure properties with UNIQUENESS constraints are marked as required."""
        if not constraints:
            return

        # Build a lookup for property_names and constraints
        constraint_props: Dict[str, set[str]] = {}
        for c in constraints:
            if c.get("type") == "UNIQUENESS":
                label = c.get("node_type")
                prop = c.get("property_name")
                if label and prop:
                    constraint_props.setdefault(label, set()).add(prop)

        # Skip node_types without constraints
        for node_type in node_types:
            label = node_type.get("label")
            if label not in constraint_props:
                continue

            props_to_fix = constraint_props[label]
            for prop in node_type.get("properties", []):
                if isinstance(prop, dict) and prop.get("name") in props_to_fix:
                    if prop.get("required") is not True:
                        logging.info(
                            f"Auto-setting 'required' as True for property '{prop.get('name')}' "
                            f"on node '{label}' (has UNIQUENESS constraint)."
                        )
                        prop["required"] = True

    def _clean_json_content(self, content: str) -> str:
        content = content.strip()

        # Remove markdown code block markers if present
        content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"```\s*$", "", content, flags=re.MULTILINE)

        return content.strip()

    def _parse_llm_response(self, content: str) -> Dict[str, Any]:
        """Parse LLM response into schema dictionary.

        Args:
            content: JSON string from LLM response

        Returns:
            Parsed dictionary

        Raises:
            SchemaExtractionError: If content is not valid JSON
        """
        try:
            result = json.loads(content)
            return cast(Dict[str, Any], result)
        except json.JSONDecodeError as exc:
            raise SchemaExtractionError("LLM response is not valid JSON.") from exc

    def _parse_and_normalize_schema(self, content: str) -> Dict[str, Any]:
        """Parse and normalize V1 schema response (handles lists/dicts).

        V1 (prompt-based) extraction sometimes returns lists instead of dicts.
        This method normalizes the response to always return a dict.

        Args:
            content: JSON string from LLM response

        Returns:
            Normalized schema dictionary

        Raises:
            SchemaExtractionError: If content is not valid JSON or has unexpected format
        """
        extracted_schema = self._parse_llm_response(content)

        # Handle list responses
        if isinstance(extracted_schema, list):
            if len(extracted_schema) == 0:
                logging.info(
                    "LLM returned an empty list for schema. Falling back to empty schema."
                )
                return {}
            elif isinstance(extracted_schema[0], dict):
                return extracted_schema[0]
            else:
                raise SchemaExtractionError(
                    f"Expected a dictionary or list of dictionaries, but got list containing: {type(extracted_schema[0])}"
                )
        elif isinstance(extracted_schema, dict):
            return extracted_schema
        else:
            raise SchemaExtractionError(
                f"Unexpected schema format returned from LLM: {type(extracted_schema)}. Expected a dictionary or list of dictionaries."
            )

    def _apply_v1_filters(self, extracted_schema: Dict[str, Any]) -> Dict[str, Any]:
        """Apply V1-specific filters before cross-reference filtering.

        V1 (prompt-based) extraction requires additional filtering:
        - Remove nodes/relationships without labels
        - Clean up invalid 'required' field values
        - Remove nodes with no properties (after property filtering)

        Args:
            extracted_schema: Raw schema dictionary from LLM

        Returns:
            Filtered schema dictionary
        """
        node_types = extracted_schema.get("node_types") or []
        rel_types = extracted_schema.get("relationship_types")

        # Filter items without labels
        node_types = self._filter_nodes_without_labels(node_types)
        if rel_types:
            rel_types = self._filter_relationships_without_labels(rel_types)

        # Filter invalid required fields
        node_types = self._filter_properties_required_field(node_types)

        # Filter nodes with no properties (after property filtering)
        # This prevents validation errors from min_length=1 constraint on NodeType.properties
        nodes_before = len(node_types)
        node_types = [
            node for node in node_types if len(node.get("properties", [])) > 0
        ]
        if len(node_types) < nodes_before:
            removed_count = nodes_before - len(node_types)
            logging.info(
                f"Filtered out {removed_count} node type(s) with no properties after property validation. "
                f"This can happen when all properties have invalid 'required' field values."
            )

        extracted_schema["node_types"] = node_types
        extracted_schema["relationship_types"] = rel_types
        return extracted_schema

    def _validate_and_build_schema(
        self, extracted_schema: Dict[str, Any]
    ) -> GraphSchema:
        """Apply cross-reference filters and validate schema.

        This is the final step shared by both V1 and V2 paths:
        - Extract node types, relationship types, patterns, and constraints
        - Apply cross-reference filtering (remove invalid patterns/constraints)
        - Validate using Pydantic GraphSchema model

        Args:
            extracted_schema: Schema dictionary (after V1/V2-specific filtering)

        Returns:
            Validated GraphSchema object

        Raises:
            SchemaExtractionError: If validation fails
        """
        node_types = extracted_schema.get("node_types") or []
        rel_types = extracted_schema.get("relationship_types")
        patterns = extracted_schema.get("patterns")
        constraints = extracted_schema.get("constraints")

        # Apply cross-reference filtering
        patterns, constraints = self._apply_cross_reference_filters(
            node_types, rel_types, patterns, constraints
        )

        # Validate and return
        try:
            schema = GraphSchema.model_validate(
                {
                    "node_types": node_types,
                    "relationship_types": rel_types,
                    "patterns": patterns,
                    "constraints": constraints or [],
                }
            )
            logger.debug(f"Extracted schema: {schema}")
            return schema
        except ValidationError as e:
            raise SchemaExtractionError(
                f"LLM response does not conform to GraphSchema: {str(e)}"
            ) from e

    async def _run_with_structured_output(self, prompt: str) -> GraphSchema:
        """Extract schema using structured output (V2).

        V2 uses LLMInterfaceV2 with response_format=GraphSchema to enforce
        the schema structure at the LLM level. This requires OpenAI or VertexAI.

        Args:
            prompt: Formatted prompt for schema extraction

        Returns:
            Validated GraphSchema object

        Raises:
            RuntimeError: If LLM is not OpenAILLM or VertexAILLM
            SchemaExtractionError: If LLM generation or validation fails
        """
        # Capability check
        # This should never happen due to __init__ validation
        if not self._llm.supports_structured_output:
            raise RuntimeError(
                f"Structured output is not supported by {type(self._llm).__name__}"
            )

        # Invoke LLM with structured output
        messages = [LLMMessage(role="user", content=prompt)]
        try:
            llm_result = await self._llm.ainvoke(messages, response_format=GraphSchema)  # type: ignore[call-arg, arg-type]
        except LLMGenerationError as e:
            raise SchemaExtractionError("Failed to generate schema from text") from e

        # Parse JSON response
        # Note: With structured output, this should always succeed, but we keep
        # error handling for unexpected provider issues
        extracted_schema = self._parse_llm_response(llm_result.content)

        # Validate and return (applies cross-reference filtering)
        return self._validate_and_build_schema(extracted_schema)

    async def _run_with_prompt_based_extraction(self, prompt: str) -> GraphSchema:
        """Extract schema using prompt-based JSON extraction (V1).

        V1 uses standard LLM prompting with JSON output. This requires additional
        filtering and cleanup compared to V2 structured output.

        Args:
            prompt: Formatted prompt for schema extraction

        Returns:
            Validated GraphSchema object

        Raises:
            LLMGenerationError: If LLM generation fails
            SchemaExtractionError: If parsing or validation fails
        """
        # Invoke LLM
        try:
            response = await self._llm.ainvoke(prompt, **self._llm_params)
            content = response.content
        except LLMGenerationError as e:
            raise LLMGenerationError("Failed to generate schema from text") from e

        # Clean and parse response
        content = self._clean_json_content(content)
        extracted_schema = self._parse_and_normalize_schema(content)

        # Apply V1-specific filtering
        extracted_schema = self._apply_v1_filters(extracted_schema)

        # Validate and return (applies cross-reference filtering)
        return self._validate_and_build_schema(extracted_schema)

    @validate_call
    async def run(self, text: str, examples: str = "", **kwargs: Any) -> GraphSchema:
        """
        Asynchronously extracts the schema from text and returns a GraphSchema object.

        Args:
            text (str): the text from which the schema will be inferred.
            examples (str): examples to guide schema extraction.
        Returns:
            GraphSchema: A configured schema object, extracted automatically and
            constructed asynchronously.
        """
        prompt: str = self._prompt_template.format(text=text, examples=examples)

        if self.use_structured_output:
            return await self._run_with_structured_output(prompt)
        else:
            return await self._run_with_prompt_based_extraction(prompt)


class SchemaFromExistingGraphExtractor(BaseSchemaBuilder):
    """A class to build a GraphSchema object from an existing graph.

     Uses the get_structured_schema function to extract existing node labels,
     relationship types, properties and existence constraints.

     By default, the built schema does not allow any additional item (property,
     node label, relationship type or pattern).

    Args:
         driver (neo4j.Driver): connection to the neo4j database.
         additional_properties (bool, default False): see GraphSchema
         additional_node_types (bool, default False): see GraphSchema
         additional_relationship_types (bool, default False): see GraphSchema:
         additional_patterns (bool, default False): see GraphSchema:
         neo4j_database (Optional | str): name of the neo4j database to use
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        additional_properties: bool | None = None,
        additional_node_types: bool | None = None,
        additional_relationship_types: bool | None = None,
        additional_patterns: bool | None = None,
        neo4j_database: Optional[str] = None,
    ) -> None:
        self.driver = driver
        self.database = neo4j_database

        self.additional_properties = additional_properties
        self.additional_node_types = additional_node_types
        self.additional_relationship_types = additional_relationship_types
        self.additional_patterns = additional_patterns

    @staticmethod
    def _extract_required_properties(
        structured_schema: dict[str, Any],
    ) -> list[tuple[str, str]]:
        """Extract a list of (node label (or rel type), property name) for which
         an "EXISTENCE" or "KEY" constraint is defined in the DB.

         Args:

             structured_schema (dict[str, Any]): the result of the `get_structured_schema()` function.

        Returns:

            list of tuples of (node label (or rel type), property name)

        """
        schema_metadata = structured_schema.get("metadata", {})
        existence_constraint = []  # list of (node label, property name)
        for constraint in schema_metadata.get("constraint", []):
            if constraint["type"] in (
                "NODE_PROPERTY_EXISTENCE",
                "NODE_KEY",
                "RELATIONSHIP_PROPERTY_EXISTENCE",
                "RELATIONSHIP_KEY",
            ):
                properties = constraint["properties"]
                labels = constraint["labelsOrTypes"]
                # note: existence constraint only apply to a single property
                # and a single label
                prop = properties[0]
                lab = labels[0]
                existence_constraint.append((lab, prop))
        return existence_constraint

    def _to_schema_entity_dict(
        self,
        key: str,
        property_dict: list[dict[str, Any]],
        existence_constraint: list[tuple[str, str]],
    ) -> dict[str, Any]:
        entity_dict: dict[str, Any] = {
            "label": key,
            "properties": [
                {
                    "name": p["property"],
                    "type": p["type"],
                    "required": (key, p["property"]) in existence_constraint,
                }
                for p in property_dict
            ],
        }
        if self.additional_properties:
            entity_dict["additional_properties"] = self.additional_properties
        return entity_dict

    async def run(self, *args: Any, **kwargs: Any) -> GraphSchema:
        structured_schema = get_structured_schema(self.driver, database=self.database)
        existence_constraint = self._extract_required_properties(structured_schema)

        # node label with properties
        node_labels = set(structured_schema["node_props"].keys())
        node_types = [
            self._to_schema_entity_dict(key, properties, existence_constraint)
            for key, properties in structured_schema["node_props"].items()
        ]

        # relationships with properties
        rel_labels = set(structured_schema["rel_props"].keys())
        relationship_types = [
            self._to_schema_entity_dict(key, properties, existence_constraint)
            for key, properties in structured_schema["rel_props"].items()
        ]

        patterns = [
            (s["start"], s["type"], s["end"])
            for s in structured_schema["relationships"]
        ]

        # deal with nodes and relationships without properties
        for source, rel, target in patterns:
            if source not in node_labels:
                if self.additional_properties is False:
                    logger.warning(
                        f"SCHEMA: found node label {source} without property and additional_properties=False: this node label will always be pruned!"
                    )
                node_labels.add(source)
                node_types.append(
                    {
                        "label": source,
                    }
                )
            if target not in node_labels:
                if self.additional_properties is False:
                    logger.warning(
                        f"SCHEMA: found node label {target} without property and additional_properties=False: this node label will always be pruned!"
                    )
                node_labels.add(target)
                node_types.append(
                    {
                        "label": target,
                    }
                )
            if rel not in rel_labels:
                rel_labels.add(rel)
                relationship_types.append(
                    {
                        "label": rel,
                    }
                )
        schema_dict: dict[str, Any] = {
            "node_types": node_types,
            "relationship_types": relationship_types,
            "patterns": patterns,
        }
        if self.additional_node_types is not None:
            schema_dict["additional_node_types"] = self.additional_node_types
        if self.additional_relationship_types is not None:
            schema_dict["additional_relationship_types"] = (
                self.additional_relationship_types
            )
        if self.additional_patterns is not None:
            schema_dict["additional_patterns"] = self.additional_patterns
        return GraphSchema.model_validate(
            schema_dict,
        )
