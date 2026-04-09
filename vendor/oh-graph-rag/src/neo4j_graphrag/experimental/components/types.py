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

import logging
import uuid
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from neo4j_graphrag.experimental.pipeline.component import DataModel


logger = logging.getLogger(__name__)


class GeoPoint(BaseModel):
    """Represents a geographic point with latitude, longitude, and height.

    Attributes:
        latitude (float): The latitude coordinate.
        longitude (float): The longitude coordinate.
        height (float): The height/altitude coordinate.
    """

    model_config = ConfigDict(extra="forbid")

    latitude: float
    longitude: float
    height: float


# Define primitive value types
PrimitiveValue = Union[bool, int, float, str]

# Define temporal value types (ISO 8601 strings for date, time, datetime)
TemporalValue = Union[date, time, datetime]

# Define duration as a string with ISO 8601 duration pattern (e.g., "P1Y2M3DT4H5M6S")
Duration = str

# Define the complete PropertyValue union covering all Neo4j property types
PropertyValue = Union[
    PrimitiveValue,
    TemporalValue,
    Duration,
    List[Union[bool, int, float, str]],  # Arrays of primitives
    GeoPoint,
]


class DocumentInfo(DataModel):
    """A document loaded by a DataLoader.

    Attributes:
        path (str): Document path.
        metadata (Optional[dict[str, Any]]): Metadata associated with this document.
        uid (str): Unique identifier for this document.
    """

    path: str
    metadata: Optional[Dict[str, str]] = None
    uid: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_type: Optional[str] = None

    @property
    def document_id(self) -> str:
        return self.uid


class PdfDocument(DataModel):
    text: str
    document_info: DocumentInfo


class TextChunk(BaseModel):
    """A chunk of text split from a document by a text splitter.

    Attributes:
        text (str): The raw chunk text.
        index (int): The position of this chunk in the original document.
        metadata (Optional[dict[str, Any]]): Metadata associated with this chunk.
        uid (str): Unique identifier for this chunk.
    """

    text: str
    index: int
    metadata: Optional[dict[str, Any]] = None
    uid: str = Field(default_factory=lambda: str(uuid.uuid4()))

    @property
    def chunk_id(self) -> str:
        return self.uid


class TextChunks(DataModel):
    """A collection of text chunks returned from a text splitter.

    Attributes:
        chunks (list[TextChunk]): A list of text chunks.
    """

    chunks: list[TextChunk]


class Neo4jNode(BaseModel):
    """Represents a Neo4j node.

    Attributes:
        id (str): The ID of the node. This ID is used to refer to the node for relationship creation.
        label (str): The label of the node.
        properties (dict[str, PropertyValue]): A dictionary of properties attached to the node.
        embedding_properties (dict[str, list[float]]): A dictionary of embedding properties attached to the node.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    properties: dict[str, PropertyValue] = Field(default_factory=dict)
    embedding_properties: dict[str, list[float]] = Field(default_factory=dict)

    @property
    def token(self) -> str:
        return self.label


class Neo4jRelationship(BaseModel):
    """Represents a Neo4j relationship.

    Attributes:
        start_node_id (str): The ID of the start node.
        end_node_id (str): The ID of the end node.
        type (str): The relationship type.
        properties (dict[str, PropertyValue]): A dictionary of properties attached to the relationship.
        embedding_properties (dict[str, list[float]]): A dictionary of embedding properties attached to the relationship.
    """

    model_config = ConfigDict(extra="forbid")

    start_node_id: str
    end_node_id: str
    type: str
    properties: dict[str, PropertyValue] = Field(default_factory=dict)
    embedding_properties: dict[str, list[float]] = Field(default_factory=dict)

    @property
    def token(self) -> str:
        return self.type


class Neo4jGraph(DataModel):
    """Represents a Neo4j graph.

    Attributes:
        nodes (list[Neo4jNode]): A list of nodes in the graph.
        relationships (list[Neo4jRelationship]): A list of relationships in the graph.
    """

    model_config = ConfigDict(extra="forbid")

    nodes: list[Neo4jNode] = Field(default_factory=list)
    relationships: list[Neo4jRelationship] = Field(default_factory=list)

    @classmethod
    def model_json_schema(cls, **kwargs: Any) -> dict[str, Any]:  # type: ignore[override]
        """Override to mark nodes and relationships as required in JSON schema."""
        schema = super().model_json_schema(**kwargs)
        # Force nodes and relationships to be required for structured output compatibility
        schema["required"] = ["nodes", "relationships"]
        return schema


class ResolutionStats(DataModel):
    number_of_nodes_to_resolve: int
    number_of_created_nodes: Optional[int] = None


DEFAULT_DOCUMENT_NODE_LABEL = "Document"
DEFAULT_CHUNK_NODE_LABEL = "Chunk"
DEFAULT_CHUNK_TO_DOCUMENT_RELATIONSHIP_TYPE = "FROM_DOCUMENT"
DEFAULT_NEXT_CHUNK_RELATIONSHIP_TYPE = "NEXT_CHUNK"
DEFAULT_NODE_TO_CHUNK_RELATIONSHIP_TYPE = "FROM_CHUNK"
DEFAULT_CHUNK_ID_PROPERTY = "id"
DEFAULT_CHUNK_INDEX_PROPERTY = "index"
DEFAULT_CHUNK_TEXT_PROPERTY = "text"
DEFAULT_CHUNK_EMBEDDING_PROPERTY = "embedding"


class LexicalGraphConfig(BaseModel):
    """Configure all labels and property names in the lexical graph."""

    id_prefix: str = Field(deprecated=True, default="")
    document_node_label: str = DEFAULT_DOCUMENT_NODE_LABEL
    chunk_node_label: str = DEFAULT_CHUNK_NODE_LABEL
    chunk_to_document_relationship_type: str = (
        DEFAULT_CHUNK_TO_DOCUMENT_RELATIONSHIP_TYPE
    )
    next_chunk_relationship_type: str = DEFAULT_NEXT_CHUNK_RELATIONSHIP_TYPE
    node_to_chunk_relationship_type: str = DEFAULT_NODE_TO_CHUNK_RELATIONSHIP_TYPE
    chunk_id_property: str = DEFAULT_CHUNK_ID_PROPERTY
    chunk_index_property: str = DEFAULT_CHUNK_INDEX_PROPERTY
    chunk_text_property: str = DEFAULT_CHUNK_TEXT_PROPERTY
    chunk_embedding_property: str = DEFAULT_CHUNK_EMBEDDING_PROPERTY

    @property
    def lexical_graph_node_labels(self) -> tuple[str, ...]:
        return self.document_node_label, self.chunk_node_label

    @property
    def lexical_graph_relationship_types(self) -> tuple[str, ...]:
        return (
            self.chunk_to_document_relationship_type,
            self.next_chunk_relationship_type,
            self.node_to_chunk_relationship_type,
        )


class GraphResult(DataModel):
    graph: Neo4jGraph
    config: LexicalGraphConfig
