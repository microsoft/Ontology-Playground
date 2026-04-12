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

import warnings
from enum import Enum
from typing import Any, Callable, Literal, Optional, Union
from typing_extensions import TypedDict

import neo4j
from pydantic import (
    BaseModel,
    ConfigDict,
    PositiveInt,
    field_validator,
    model_validator,
)
from typing_extensions import Self

from neo4j_graphrag.utils.validation import validate_search_query_input


class RawSearchResult(BaseModel):
    """
    Represents the raw result returned from the retriever get_search_result
    method. It needs to be formatted further before being returned as a RetrieverResult.

    Attributes:
        records (list[neo4j.Record]): A list of records from neo4j.
        metadata: Record-related metadata, such as score.
    """

    records: list[neo4j.Record]
    metadata: Optional[dict[str, Any]] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("records")
    def check_records(cls, value: neo4j.Record) -> neo4j.Record:
        for v in value:
            if not isinstance(v, neo4j.Record):
                raise TypeError(
                    "Type mismatch, expected neo4j.Record, got {}".format(type(v))
                )
        return value


class RetrieverResultItem(BaseModel):
    """
    A single record returned from a retriever.

    Attributes:
        content (str): The context as will be provided to the LLM
        metadata (Optional[dict]): Any metadata that can be included together
            with the text, related to that record (e.g. another node property)
    """

    content: Any
    metadata: Optional[dict[str, Any]] = None


class RetrieverResult(BaseModel):
    """
    Represents a result returned from a retriever.

    Attributes:
        items (list[RetrieverResultItem]): A list of retrieved items.
        metadata: Context-related metadata such as generated Cypher query
         in the Text2CypherRetriever.
    """

    items: list[RetrieverResultItem]
    metadata: Optional[dict[str, Any]] = None


class Neo4jSchemaModel(BaseModel):
    neo4j_schema: str


class IndexModel(BaseModel):
    driver: Any

    @field_validator("driver")
    def check_driver_is_valid(cls, v: neo4j.Driver) -> neo4j.Driver:
        if not isinstance(v, neo4j.Driver):
            raise ValueError("driver must be an instance of neo4j.Driver")
        return v


class VectorIndexModel(IndexModel):
    name: str
    label: str
    embedding_property: str
    dimensions: PositiveInt
    similarity_fn: Literal["euclidean", "cosine"]


class FulltextIndexModel(IndexModel):
    name: str
    label: str
    node_properties: list[str]

    @field_validator("node_properties")
    def check_node_properties_not_empty(cls, v: list[Any]) -> list[Any]:
        if len(v) == 0:
            raise ValueError("node_properties cannot be an empty list")
        return v


class VectorSearchModel(BaseModel):
    query_vector: Optional[list[float]] = None
    query_text: Optional[str] = None
    top_k: PositiveInt = 5
    effective_search_ratio: PositiveInt = 1
    filters: Optional[dict[str, Any]] = None

    @model_validator(mode="before")
    def check_query(cls, values: dict[str, Any]) -> dict[str, Any]:
        """
        Validates that one of either query_vector or query_text is provided exclusively.
        """
        query_vector, query_text = values.get("query_vector"), values.get("query_text")
        validate_search_query_input(query_text, query_vector)
        return values


class VectorCypherSearchModel(VectorSearchModel):
    query_params: Optional[dict[str, Any]] = None


class HybridSearchRanker(Enum):
    """Enumerator of Hybrid search rankers."""

    NAIVE = "naive"
    LINEAR = "linear"


class HybridSearchModel(BaseModel):
    query_text: str
    query_vector: Optional[list[float]] = None
    top_k: PositiveInt = 5
    effective_search_ratio: PositiveInt = 1
    ranker: Union[str, HybridSearchRanker] = HybridSearchRanker.NAIVE
    alpha: Optional[float] = None

    @field_validator("ranker", mode="before")
    def validate_ranker(cls, v: Union[str, HybridSearchRanker]) -> HybridSearchRanker:
        if isinstance(v, str):
            try:
                return HybridSearchRanker(v.lower())
            except ValueError:
                allowed = ", ".join([r.value for r in HybridSearchRanker])
                raise ValueError(
                    f"Invalid ranker value. Allowed values are: {allowed}."
                )
        elif isinstance(v, HybridSearchRanker):
            return v
        else:
            allowed = ", ".join([r.value for r in HybridSearchRanker])
            raise ValueError(f"Invalid ranker type. Allowed values are: {allowed}.")

    @model_validator(mode="after")
    def validate_alpha(self) -> Self:
        ranker, alpha = self.ranker, self.alpha
        if ranker == HybridSearchRanker.LINEAR:
            if alpha is None:
                raise ValueError("alpha must be provided when using the linear ranker")
            if not (0.0 <= alpha <= 1.0):
                raise ValueError("alpha must be between 0 and 1")
        else:
            if alpha is not None:
                warnings.warn(
                    "alpha parameter is only used when ranker is 'linear'. Ignoring alpha.",
                    UserWarning,
                )
                self.alpha = None
        return self


class HybridCypherSearchModel(HybridSearchModel):
    query_params: Optional[dict[str, Any]] = None


class Text2CypherSearchModel(BaseModel):
    query_text: str


class SearchType(str, Enum):
    """Enumerator of the search strategies."""

    VECTOR = "vector"
    HYBRID = "hybrid"


class EntityType(str, Enum):
    """Enumerator of the entity types."""

    NODE = "NODE"
    RELATIONSHIP = "RELATIONSHIP"


class EmbedderModel(BaseModel):
    embedder: Optional[Any]
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("embedder")
    def check_embedder(cls, value: dict[str, Any]) -> dict[str, Any]:
        if not hasattr(value, "embed_query") or not callable(
            getattr(value, "embed_query", None)
        ):
            raise ValueError(
                "Provided embedder object must have an 'embed_query' callable method."
            )
        return value


class LLMModel(BaseModel):
    llm: Any
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("llm")
    def check_llm(cls, value: object) -> object:
        if not hasattr(value, "invoke") or not callable(getattr(value, "invoke", None)):
            raise ValueError(
                "Provided llm object must have an 'invoke' callable method."
            )
        return value


class Neo4jDriverModel(BaseModel):
    driver: neo4j.Driver
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("driver")
    def check_driver(cls, value: neo4j.Driver) -> neo4j.Driver:
        if not isinstance(value, neo4j.Driver):
            raise ValueError("Provided driver needs to be of type neo4j.Driver")
        return value


class VectorRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    index_name: str
    embedder_model: Optional[EmbedderModel] = None
    return_properties: Optional[list[str]] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    neo4j_database: Optional[str] = None


class VectorCypherRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    index_name: str
    retrieval_query: str
    embedder_model: Optional[EmbedderModel] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    neo4j_database: Optional[str] = None


class HybridRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    vector_index_name: str
    fulltext_index_name: str
    embedder_model: Optional[EmbedderModel] = None
    return_properties: Optional[list[str]] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    neo4j_database: Optional[str] = None


class HybridCypherRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    vector_index_name: str
    fulltext_index_name: str
    retrieval_query: str
    embedder_model: Optional[EmbedderModel] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    neo4j_database: Optional[str] = None


class Text2CypherRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    llm_model: LLMModel
    neo4j_schema_model: Optional[Neo4jSchemaModel] = None
    examples: Optional[list[str]] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    custom_prompt: Optional[str] = None
    neo4j_database: Optional[str] = None


class Neo4jMessageHistoryModel(BaseModel):
    session_id: Union[str, int]
    driver_model: Neo4jDriverModel
    window: Optional[PositiveInt] = None
    database: Optional[str] = None

    @field_validator("session_id")
    def validate_session_id(cls, v: Union[str, int]) -> Union[str, int]:
        if isinstance(v, str) and len(v) == 0:
            raise ValueError("session_id cannot be empty")
        return v


class LLMMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str
