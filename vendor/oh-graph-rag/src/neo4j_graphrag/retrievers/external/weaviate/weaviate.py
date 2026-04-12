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
from typing import TYPE_CHECKING, Any, Callable, Optional

import neo4j
import weaviate.classes as wvc
from pydantic import ValidationError

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import (
    RetrieverInitializationError,
    SearchValidationError,
)
from neo4j_graphrag.retrievers.base import ExternalRetriever
from neo4j_graphrag.retrievers.external.utils import get_match_query
from neo4j_graphrag.retrievers.external.weaviate.types import (
    WeaviateModel,
    WeaviateNeo4jRetrieverModel,
    WeaviateNeo4jSearchModel,
)
from neo4j_graphrag.types import (
    EmbedderModel,
    Neo4jDriverModel,
    RawSearchResult,
    RetrieverResultItem,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from weaviate.client import WeaviateClient


class WeaviateNeo4jRetriever(ExternalRetriever):
    """
    Provides retrieval method using vector search over embeddings with a Weaviate database.
    If an embedder is provided, it needs to have the required Embedder type.

    Example:

    .. code-block:: python

      from neo4j import GraphDatabase
      from neo4j_graphrag.retrievers import WeaviateNeo4jRetriever
      from weaviate.connect.helpers import connect_to_local

      with GraphDatabase.driver(NEO4J_URL, auth=NEO4J_AUTH) as neo4j_driver:
          with connect_to_local() as w_client:
              retriever = WeaviateNeo4jRetriever(
                  driver=neo4j_driver,
                  client=w_client,
                  collection="Jeopardy",
                  id_property_external="neo4j_id",
                  id_property_neo4j="id"
              )

              result = retriever.search(query_text="biology", top_k=2)

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        client (WeaviateClient): The Weaviate client object.
        collection (str): Name of a set of Weaviate objects that share the same data structure.
        id_property_external (str): The name of the Weaviate property that has the identifier that refers to a corresponding Neo4j node id property.
        id_property_neo4j (str): The name of the Neo4j node property that's used as the identifier for relating matches from Weaviate to Neo4j nodes.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        return_properties (Optional[list[str]]): List of node properties to return.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Function to transform a neo4j.Record to a RetrieverResultItem.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).
        node_label_neo4j (Optional[str]): The label of the Neo4j node to retrieve. This label must be properly escaped if needed, eg "`Label with spaces`".

    Raises:
        RetrieverInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        client: WeaviateClient,
        collection: str,
        id_property_external: str,
        id_property_neo4j: str,
        embedder: Optional[Embedder] = None,
        return_properties: Optional[list[str]] = None,
        retrieval_query: Optional[str] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
        node_label_neo4j: Optional[str] = None,
    ):
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            weaviate_model = WeaviateModel(client=client)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = WeaviateNeo4jRetrieverModel(
                driver_model=driver_model,
                client_model=weaviate_model,
                collection=collection,
                id_property_external=id_property_external,
                id_property_neo4j=id_property_neo4j,
                embedder_model=embedder_model,
                return_properties=return_properties,
                retrieval_query=retrieval_query,
                result_formatter=result_formatter,
                neo4j_database=neo4j_database,
                node_label_neo4j=node_label_neo4j,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            driver,
            id_property_external,
            id_property_neo4j,
            neo4j_database,
            node_label_neo4j,
        )
        self.client = validated_data.client_model.client
        collection = validated_data.collection
        self.search_collection = self.client.collections.get(collection)
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.return_properties = validated_data.return_properties
        self.retrieval_query = validated_data.retrieval_query
        self.result_formatter = validated_data.result_formatter

    def get_search_results(
        self,
        query_vector: Optional[list[float]] = None,
        query_text: Optional[str] = None,
        top_k: int = 5,
        **kwargs: Any,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbor embeddings using Weaviate for either provided query_vector or query_text.
        Both query_vector and query_text can be provided.
        If query_vector is provided, then it will be preferred over the embedded query_text
        for the vector search.
        If query_text is provided, then it will check if an embedder is provided and use it to generate the query_vector.
        If no embedder is provided, then it will assume that the vectorizer is used in Weaviate.

        Example:

        .. code-block:: python

          import neo4j
          from neo4j_graphrag.retrievers import WeaviateNeo4jRetriever

          driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

          retriever = WeaviateNeo4jRetriever(
              driver=driver,
              client=weaviate_client,
              collection="Jeopardy",
              id_property_external="neo4j_id",
              id_property_neo4j="id",
              node_label_neo4j="Document",
          )

          biology_embedding = ...
          retriever.search(query_vector=biology_embedding, top_k=2)


        Args:
            query_text (Optional[str]): The text to get the closest neighbors of.
            query_vector (Optional[list[float]]): The vector embeddings to get the closest neighbors of. Defaults to None.
            top_k (int): The number of neighbors to return. Defaults to 5.
        Raises:
            SearchValidationError: If validation of the input arguments fail.
        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """

        weaviate_filters = kwargs.get("weaviate_filters")

        try:
            validated_data = WeaviateNeo4jSearchModel(
                top_k=top_k,
                query_vector=query_vector,
                query_text=query_text,
                weaviate_filters=weaviate_filters,
            )
            query_text = validated_data.query_text or ""
            query_vector = validated_data.query_vector
            top_k = validated_data.top_k
            weaviate_filters = validated_data.weaviate_filters
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        # If we want to use a local embedder, we still want to call the near_vector method
        # so we want to create the vector as early as possible here
        if query_text:
            if self.embedder:
                query_vector = self.embedder.embed_query(query_text)
                logger.debug("Locally generated query vector: %s", query_vector)
            else:
                logger.debug(
                    "No embedder provided, assuming vectorizer is used in Weaviate."
                )

        if query_vector:
            response = self.search_collection.query.near_vector(
                near_vector=query_vector,
                limit=top_k,
                filters=weaviate_filters,
                return_metadata=wvc.query.MetadataQuery(certainty=True),
            )
            logger.debug("Weaviate query vector: %s", query_vector)
            logger.debug("Response: %s", response)
        else:
            response = self.search_collection.query.near_text(
                query=query_text,
                limit=top_k,
                filters=weaviate_filters,
                return_metadata=wvc.query.MetadataQuery(certainty=True),
            )
            logger.debug("Query text: %s", query_text)
            logger.debug("Response: %s", response)

        result_tuples = [
            (f"{o.properties[self.id_property_external]}", o.metadata.certainty or 0.0)
            for o in response.objects
        ]

        search_query = get_match_query(
            return_properties=self.return_properties,
            retrieval_query=self.retrieval_query,
            node_label=self.node_label_neo4j,
        )

        parameters = {
            "match_params": result_tuples,
            "id_property": self.id_property_neo4j,
        }

        logger.debug("Weaviate Store Cypher parameters: %s", parameters)
        logger.debug("Weaviate Store Cypher query: %s", search_query)

        records, _, _ = self.driver.execute_query(
            search_query,
            parameters,
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )

        return RawSearchResult(records=records)
