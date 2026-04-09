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
from typing import Any, Callable, Optional, Union

import neo4j
from pydantic import ValidationError

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import (
    EmbeddingRequiredError,
    RetrieverInitializationError,
    SearchValidationError,
    SearchQueryParseError,
)
from neo4j_graphrag.neo4j_queries import get_search_query
from neo4j_graphrag.retrievers.base import Retriever
from neo4j_graphrag.types import (
    EmbedderModel,
    HybridCypherRetrieverModel,
    HybridCypherSearchModel,
    HybridRetrieverModel,
    HybridSearchModel,
    Neo4jDriverModel,
    RawSearchResult,
    RetrieverResultItem,
    SearchType,
    HybridSearchRanker,
)
from neo4j_graphrag.utils.logging import prettify

logger = logging.getLogger(__name__)


class HybridRetriever(Retriever):
    """
    Provides retrieval method using combination of vector search over embeddings and
    fulltext search.
    If an embedder is provided, it needs to have the required Embedder type.

    Example:

    .. code-block:: python

      import neo4j
      from neo4j_graphrag.retrievers import HybridRetriever

      driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

      retriever = HybridRetriever(
          driver, "vector-index-name", "fulltext-index-name", custom_embedder
      )
      retriever.search(query_text="Find me a book about Fremen", top_k=5)

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        vector_index_name (str): Vector index name.
        fulltext_index_name (str): Fulltext index name.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        return_properties (Optional[list[str]]): List of node properties to return.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Provided custom function to transform a neo4j.Record to a RetrieverResultItem.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

            Two variables are provided in the neo4j.Record:

            -   node: Represents the node retrieved from the vector index search.
            -   score: Denotes the similarity score.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        vector_index_name: str,
        fulltext_index_name: str,
        embedder: Optional[Embedder] = None,
        return_properties: Optional[list[str]] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
    ) -> None:
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = HybridRetrieverModel(
                driver_model=driver_model,
                vector_index_name=vector_index_name,
                fulltext_index_name=fulltext_index_name,
                embedder_model=embedder_model,
                return_properties=return_properties,
                result_formatter=result_formatter,
                neo4j_database=neo4j_database,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            validated_data.driver_model.driver, validated_data.neo4j_database
        )
        self.vector_index_name = validated_data.vector_index_name
        self.fulltext_index_name = validated_data.fulltext_index_name
        self.return_properties = validated_data.return_properties
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.result_formatter = validated_data.result_formatter
        self._embedding_node_property = None
        self._embedding_dimension = None
        self._fetch_index_infos(self.vector_index_name)

    def default_record_formatter(self, record: neo4j.Record) -> RetrieverResultItem:
        """
        Best effort to guess the node-to-text method. Inherited classes
        can override this method to implement custom text formatting.
        """
        metadata = {
            "score": record.get("score"),
        }
        node = record.get("node")
        return RetrieverResultItem(
            content=str(node),
            metadata=metadata,
        )

    def get_search_results(
        self,
        query_text: str,
        query_vector: Optional[list[float]] = None,
        top_k: int = 5,
        effective_search_ratio: int = 1,
        ranker: Union[str, HybridSearchRanker] = HybridSearchRanker.NAIVE,
        alpha: Optional[float] = None,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbor embeddings for either provided query_vector or query_text.
        Both query_vector and query_text can be provided.
        If query_vector is provided, then it will be preferred over the embedded query_text
        for the vector search.

        See the following documentation for more details:

        - `Query a vector index <https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/#indexes-vector-query>`_
        - `db.index.vector.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_vector_queryNodes>`_
        - `db.index.fulltext.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_fulltext_querynodes>`_

        To query by text, an embedder must be provided when the class is instantiated.

        Args:
            query_text (str): The text to get the closest neighbors of.
            query_vector (Optional[list[float]], optional): The vector embeddings to get the closest neighbors of. Defaults to None.
            top_k (int, optional): The number of neighbors to return. Defaults to 5.
            effective_search_ratio (int): Controls the candidate pool size for the vector index by multiplying top_k to balance query
                accuracy and performance. Defaults to 1.
            ranker (str, HybridSearchRanker): Type of ranker to order the results from retrieval.
            alpha (Optional[float]): Weight for the vector score when using the linear ranker.
                The fulltext index score is multiplied by (1 - alpha).
                **Required** when using the linear ranker; must be between 0 and 1.

        Raises:
            SearchValidationError: If validation of the input arguments fail.
            EmbeddingRequiredError: If no embedder is provided.

        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """
        try:
            validated_data = HybridSearchModel(
                query_vector=query_vector,
                query_text=query_text,
                top_k=top_k,
                effective_search_ratio=effective_search_ratio,
                ranker=ranker,
                alpha=alpha,
            )
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        parameters = validated_data.model_dump(exclude_none=True)
        parameters["vector_index_name"] = self.vector_index_name
        parameters["fulltext_index_name"] = self.fulltext_index_name

        if query_text and not query_vector:
            if not self.embedder:
                raise EmbeddingRequiredError(
                    "Embedding method required for text query."
                )
            query_vector = self.embedder.embed_query(query_text)
            parameters["query_vector"] = query_vector
        search_query, _ = get_search_query(
            search_type=SearchType.HYBRID,
            return_properties=self.return_properties,
            embedding_node_property=self._embedding_node_property,
            neo4j_version_is_5_23_or_above=self.neo4j_version_is_5_23_or_above,
            ranker=validated_data.ranker,
            alpha=validated_data.alpha,
        )

        if "ranker" in parameters:
            del parameters["ranker"]

        logger.debug("HybridRetriever Cypher parameters: %s", prettify(parameters))
        logger.debug("HybridRetriever Cypher query: %s", search_query)

        try:
            records, _, _ = self.driver.execute_query(
                search_query,
                parameters,
                database_=self.neo4j_database,
                routing_=neo4j.RoutingControl.READ,
            )
        except neo4j.exceptions.ClientError as e:
            if "org.apache.lucene.queryparser.classic.ParseException" in str(e):
                raise SearchQueryParseError(
                    f"Invalid Lucene query generated from query_text: {query_text}"
                ) from e
            raise
        return RawSearchResult(
            records=records,
            metadata={"query_vector": query_vector},
        )


class HybridCypherRetriever(Retriever):
    """
    Provides retrieval method using combination of vector search over embeddings and
    fulltext search, augmented by a Cypher query.
    This retriever builds on HybridRetriever.
    If an embedder is provided, it needs to have the required Embedder type.

    Note: `node` is a variable from the base query that can be used in `retrieval_query` as seen in the example below.

    Example:

    .. code-block:: python

      import neo4j
      from neo4j_graphrag.retrievers import HybridCypherRetriever

      driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

      retrieval_query = "MATCH (node)-[:AUTHORED_BY]->(author:Author)" "RETURN author.name"
      retriever = HybridCypherRetriever(
          driver, "vector-index-name", "fulltext-index-name", retrieval_query, custom_embedder
      )
      retriever.search(query_text="Find me a book about Fremen", top_k=5)

    To query by text, an embedder must be provided when the class is instantiated.

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        vector_index_name (str): Vector index name.
        fulltext_index_name (str): Fulltext index name.
        retrieval_query (str): Cypher query that gets appended.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Provided custom function to transform a neo4j.Record to a RetrieverResultItem.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        RetrieverInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        vector_index_name: str,
        fulltext_index_name: str,
        retrieval_query: str,
        embedder: Optional[Embedder] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
    ) -> None:
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = HybridCypherRetrieverModel(
                driver_model=driver_model,
                vector_index_name=vector_index_name,
                fulltext_index_name=fulltext_index_name,
                retrieval_query=retrieval_query,
                embedder_model=embedder_model,
                result_formatter=result_formatter,
                neo4j_database=neo4j_database,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            validated_data.driver_model.driver, validated_data.neo4j_database
        )
        self.vector_index_name = validated_data.vector_index_name
        self.fulltext_index_name = validated_data.fulltext_index_name
        self.retrieval_query = validated_data.retrieval_query
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.result_formatter = validated_data.result_formatter

    def get_search_results(
        self,
        query_text: str,
        query_vector: Optional[list[float]] = None,
        top_k: int = 5,
        effective_search_ratio: int = 1,
        query_params: Optional[dict[str, Any]] = None,
        ranker: Union[str, HybridSearchRanker] = HybridSearchRanker.NAIVE,
        alpha: Optional[float] = None,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbor embeddings for either provided query_vector or query_text.
        Both query_vector and query_text can be provided.
        If query_vector is provided, then it will be preferred over the embedded query_text
        for the vector search.

        See the following documentation for more details:

        - `Query a vector index <https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/#indexes-vector-query>`_
        - `db.index.vector.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_vector_queryNodes>`_
        - `db.index.fulltext.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_fulltext_querynodes>`_

        Args:
            query_text (str): The text to get the closest neighbors of.
            query_vector (Optional[list[float]]): The vector embeddings to get the closest neighbors of. Defaults to None.
            top_k (int): The number of neighbors to return. Defaults to 5.
            effective_search_ratio (int): Controls the candidate pool size for the vector index by multiplying top_k to balance query
                accuracy and performance. Defaults to 1.
            query_params (Optional[dict[str, Any]]): Parameters for the Cypher query. Defaults to None.
            ranker (str, HybridSearchRanker): Type of ranker to order the results from retrieval.
            alpha (Optional[float]): Weight for the vector score when using the linear ranker.
                The fulltext index score is multiplied by (1 - alpha).
                **Required** when using the linear ranker; must be between 0 and 1.
        Raises:
            SearchValidationError: If validation of the input arguments fail.
            EmbeddingRequiredError: If no embedder is provided.

        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """
        try:
            validated_data = HybridCypherSearchModel(
                query_vector=query_vector,
                query_text=query_text,
                top_k=top_k,
                effective_search_ratio=effective_search_ratio,
                ranker=ranker,
                alpha=alpha,
                query_params=query_params,
            )
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        parameters = validated_data.model_dump(exclude_none=True)
        parameters["vector_index_name"] = self.vector_index_name
        parameters["fulltext_index_name"] = self.fulltext_index_name

        if query_text and not query_vector:
            if not self.embedder:
                raise EmbeddingRequiredError(
                    "Embedding method required for text query."
                )
            query_vector = self.embedder.embed_query(query_text)
            parameters["query_vector"] = query_vector

        if query_params:
            for key, value in query_params.items():
                if key not in parameters:
                    parameters[key] = value
            del parameters["query_params"]

        search_query, _ = get_search_query(
            search_type=SearchType.HYBRID,
            retrieval_query=self.retrieval_query,
            neo4j_version_is_5_23_or_above=self.neo4j_version_is_5_23_or_above,
            ranker=validated_data.ranker,
            alpha=validated_data.alpha,
        )

        if "ranker" in parameters:
            del parameters["ranker"]

        logger.debug("HybridRetriever Cypher parameters: %s", prettify(parameters))
        logger.debug("HybridRetriever Cypher query: %s", search_query)

        try:
            records, _, _ = self.driver.execute_query(
                search_query,
                parameters,
                database_=self.neo4j_database,
                routing_=neo4j.RoutingControl.READ,
            )
        except neo4j.exceptions.ClientError as e:
            if "org.apache.lucene.queryparser.classic.ParseException" in str(e):
                raise SearchQueryParseError(
                    f"Invalid Lucene query generated from query_text: {query_text}"
                ) from e
            raise
        return RawSearchResult(
            records=records,
            metadata={"query_vector": query_vector},
        )
