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
import warnings
from typing import List, Literal, Optional

import neo4j
from pydantic import ValidationError

from neo4j_graphrag.neo4j_queries import (
    UPSERT_VECTOR_ON_NODE_QUERY,
    UPSERT_VECTOR_ON_RELATIONSHIP_QUERY,
    UPSERT_VECTORS_ON_NODE_QUERY,
    UPSERT_VECTORS_ON_RELATIONSHIP_QUERY,
)

from .exceptions import Neo4jIndexError, Neo4jInsertionError
from .types import EntityType, FulltextIndexModel, VectorIndexModel

logger = logging.getLogger(__name__)


def create_vector_index(
    driver: neo4j.Driver,
    name: str,
    label: str,
    embedding_property: str,
    dimensions: int,
    similarity_fn: Literal["euclidean", "cosine"],
    fail_if_exists: bool = False,
    neo4j_database: Optional[str] = None,
) -> None:
    """
    This method constructs a Cypher query and executes it
    to create a new vector index in Neo4j.

    See Cypher manual on `creating vector indexes <https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#create-vector-index>`_.

    Ensure that the index name provided is unique within the database context.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.indexes import create_vector_index

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        INDEX_NAME = "vector-index-name"

        # Connect to Neo4j database
        driver = GraphDatabase.driver(URI, auth=AUTH)

        # Creating the index
        create_vector_index(
            driver,
            INDEX_NAME,
            label="Document",
            embedding_property="vectorProperty",
            dimensions=1536,
            similarity_fn="euclidean",
            fail_if_exists=False,
        )


    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        name (str): The unique name of the index.
        label (str): The node label to be indexed.
        embedding_property (str): The property key of a node which contains embedding values.
        dimensions (int): Vector embedding dimension
        similarity_fn (str): case-insensitive values for the vector similarity function:
            ``euclidean`` or ``cosine``.
        fail_if_exists (bool): If True raise an error if the index already exists. Defaults to False.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        ValueError: If validation of the input arguments fail.
        neo4j.exceptions.ClientError: If creation of vector index fails.
    """
    try:
        VectorIndexModel(
            driver=driver,
            name=name,
            label=label,
            embedding_property=embedding_property,
            dimensions=dimensions,
            similarity_fn=similarity_fn,
        )
    except ValidationError as e:
        raise Neo4jIndexError(
            f"Error for inputs to create_vector_index {e.errors()}"
        ) from e

    try:
        query = (
            f"CREATE VECTOR INDEX $name {'' if fail_if_exists else 'IF NOT EXISTS'} FOR (n:{label}) ON n.{embedding_property} OPTIONS "
            "{ indexConfig: { `vector.dimensions`: toInteger($dimensions), `vector.similarity_function`: $similarity_fn } }"
        )
        logger.info(f"Creating vector index named '{name}'")
        driver.execute_query(
            query,
            {"name": name, "dimensions": dimensions, "similarity_fn": similarity_fn},
            database_=neo4j_database,
        )
    except neo4j.exceptions.ClientError as e:
        raise Neo4jIndexError(f"Neo4j vector index creation failed: {e.message}") from e


def create_fulltext_index(
    driver: neo4j.Driver,
    name: str,
    label: str,
    node_properties: list[str],
    fail_if_exists: bool = False,
    neo4j_database: Optional[str] = None,
) -> None:
    """
    This method constructs a Cypher query and executes it
    to create a new fulltext index in Neo4j.

    See Cypher manual on `creating fulltext indexes <https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/#create-full-text-indexes>`_.

    Ensure that the index name provided is unique within the database context.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.indexes import create_fulltext_index

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        INDEX_NAME = "fulltext-index-name"

        # Connect to Neo4j database
        driver = GraphDatabase.driver(URI, auth=AUTH)

        # Creating the index
        create_fulltext_index(
            driver,
            INDEX_NAME,
            label="Document",
            node_properties=["vectorProperty"],
            fail_if_exists=False,
        )


    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        name (str): The unique name of the index.
        label (str): The node label to be indexed.
        node_properties (list[str]): The node properties to create the fulltext index on.
        fail_if_exists (bool): If True raise an error if the index already exists. Defaults to False.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        ValueError: If validation of the input arguments fail.
        neo4j.exceptions.ClientError: If creation of fulltext index fails.
    """
    try:
        FulltextIndexModel(
            driver=driver, name=name, label=label, node_properties=node_properties
        )
    except ValidationError as e:
        raise Neo4jIndexError(
            f"Error for inputs to create_fulltext_index: {e.errors()}"
        ) from e

    try:
        query = (
            f"CREATE FULLTEXT INDEX $name {'' if fail_if_exists else 'IF NOT EXISTS'} "
            f"FOR (n:`{label}`) ON EACH "
            f"[{', '.join(['n.`' + prop + '`' for prop in node_properties])}]"
        )
        logger.info(f"Creating fulltext index named '{name}'")
        driver.execute_query(query, {"name": name}, database_=neo4j_database)
    except neo4j.exceptions.ClientError as e:
        raise Neo4jIndexError(
            f"Neo4j fulltext index creation failed {e.message}"
        ) from e


def drop_index_if_exists(
    driver: neo4j.Driver, name: str, neo4j_database: Optional[str] = None
) -> None:
    """
    This method constructs a Cypher query and executes it
    to drop an index in Neo4j, if the index exists.
    See Cypher manual on `dropping vector indexes <https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#drop-vector-indexes>`_.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.indexes import drop_index_if_exists

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        INDEX_NAME = "fulltext-index-name"

        # Connect to Neo4j database
        driver = GraphDatabase.driver(URI, auth=AUTH)

        # Dropping the index if it exists
        drop_index_if_exists(
            driver,
            INDEX_NAME,
        )


    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        name (str): The name of the index to delete.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        neo4j.exceptions.ClientError: If dropping of index fails.
    """
    try:
        query = "DROP INDEX $name IF EXISTS"
        parameters = {
            "name": name,
        }
        logger.info(f"Dropping index named '{name}'")
        driver.execute_query(query, parameters, database_=neo4j_database)
    except neo4j.exceptions.ClientError as e:
        raise Neo4jIndexError(f"Dropping Neo4j index failed: {e.message}") from e


def upsert_vectors(
    driver: neo4j.Driver,
    ids: List[str],
    embedding_property: str,
    embeddings: List[List[float]],
    neo4j_database: Optional[str] = None,
    entity_type: EntityType = EntityType.NODE,
) -> None:
    """
    This method constructs a Cypher query and executes it to upsert
    (insert or update) embeddings on a set of nodes or relationships.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.indexes import upsert_vectors

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        # Connect to Neo4j database
        driver = GraphDatabase.driver(URI, auth=AUTH)

        # Upsert embeddings data for several nodes
        upsert_vectors(
            driver,
            ids=['123', '456', '789'],
            embedding_property="vectorProperty",
            embeddings=[
                [0.12, 0.34, 0.56],
                [0.78, 0.90, 0.12],
                [0.34, 0.56, 0.78],
            ],
            neo4j_database="neo4j",
            entity_type='NODE',
        )

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        ids (List[int]): The element IDs of the nodes or relationships.
        embedding_property (str): The name of the property to store the vectors in.
        embeddings (List[List[float]]): The list of vectors to store, one per ID.
        neo4j_database (Optional[str]): The name of the Neo4j database.
            If not provided, defaults to the server's default database. 'neo4j' by default.
        entity_type (EntityType): Specifies whether to upsert to nodes ('NODE') or relationships ('RELATIONSHIP').
            Defaults to 'NODE'.

    Raises:
        ValueError: If the lengths of IDs and embeddings do not match, or if embeddings are not of uniform dimension.
        Neo4jInsertionError: If an error occurs while attempting to upsert the vectors in Neo4j.
    """
    if entity_type == EntityType.NODE:
        query = UPSERT_VECTORS_ON_NODE_QUERY
    elif entity_type == EntityType.RELATIONSHIP:
        query = UPSERT_VECTORS_ON_RELATIONSHIP_QUERY
    else:
        raise ValueError("entity_type must be either 'NODE' or 'RELATIONSHIP'")
    if len(ids) != len(embeddings):
        raise ValueError("ids and embeddings must be the same length")
    if not all(len(embedding) == len(embeddings[0]) for embedding in embeddings):
        raise ValueError("All embeddings must be of the same size")
    try:
        parameters = {
            "rows": [
                {"id": id, "embedding": embedding}
                for id, embedding in zip(ids, embeddings)
            ],
            "embedding_property": embedding_property,
        }
        driver.execute_query(
            query_=query, parameters_=parameters, database_=neo4j_database
        )
    except neo4j.exceptions.ClientError as e:
        raise Neo4jInsertionError(
            f"Upserting vectors to Neo4j failed: {e.message}"
        ) from e


def upsert_vector(
    driver: neo4j.Driver,
    node_id: int,
    embedding_property: str,
    vector: list[float],
    neo4j_database: Optional[str] = None,
) -> None:
    """
    .. warning::
        'upsert_vector' is deprecated and will be removed in a future version, please use 'upsert_vectors' instead.

    This method constructs a Cypher query and executes it to upsert (insert or update) a vector property on a specific node.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.indexes import upsert_vector

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        # Connect to Neo4j database
        driver = GraphDatabase.driver(URI, auth=AUTH)

        # Upsert the vector data
        upsert_vector(
            driver,
            node_id="nodeId",
            embedding_property="vectorProperty",
            vector=...,
        )

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        node_id (int): The element id of the node.
        embedding_property (str): The name of the property to store the vector in.
        vector (list[float]): The vector to store.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        Neo4jInsertionError: If upserting of the vector fails.
    """
    warnings.warn(
        "'upsert_vector' is deprecated and will be removed in a future version, please use 'upsert_vectors' instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    try:
        parameters = {
            "node_element_id": node_id,
            "embedding_property": embedding_property,
            "vector": vector,
        }
        driver.execute_query(
            UPSERT_VECTOR_ON_NODE_QUERY, parameters, database_=neo4j_database
        )
    except neo4j.exceptions.ClientError as e:
        raise Neo4jInsertionError(
            f"Upserting vector to Neo4j failed: {e.message}"
        ) from e


def upsert_vector_on_relationship(
    driver: neo4j.Driver,
    rel_id: int,
    embedding_property: str,
    vector: list[float],
    neo4j_database: Optional[str] = None,
) -> None:
    """
    .. warning::
        'upsert_vector_on_relationship' is deprecated and will be removed in a future version, please use 'upsert_vectors' instead.

    This method constructs a Cypher query and executes it to upsert (insert or update) a vector property on a specific relationship.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.indexes import upsert_vector_on_relationship

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        # Connect to Neo4j database
        driver = GraphDatabase.driver(URI, auth=AUTH)

        # Upsert the vector data
        upsert_vector_on_relationship(
            driver,
            node_id="nodeId",
            embedding_property="vectorProperty",
            vector=...,
        )

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        rel_id (int): The element id of the relationship.
        embedding_property (str): The name of the property to store the vector in.
        vector (list[float]): The vector to store.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        Neo4jInsertionError: If upserting of the vector fails.
    """
    warnings.warn(
        "'upsert_vector_on_relationship' is deprecated and will be removed in a future version, please use 'upsert_vectors' instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    try:
        parameters = {
            "rel_element_id": rel_id,
            "embedding_property": embedding_property,
            "vector": vector,
        }
        driver.execute_query(
            UPSERT_VECTOR_ON_RELATIONSHIP_QUERY, parameters, database_=neo4j_database
        )
    except neo4j.exceptions.ClientError as e:
        raise Neo4jInsertionError(
            f"Upserting vector to Neo4j failed: {e.message}"
        ) from e


async def async_upsert_vector(
    driver: neo4j.AsyncDriver,
    node_id: int,
    embedding_property: str,
    vector: list[float],
    neo4j_database: Optional[str] = None,
) -> None:
    """
    .. warning::
        'async_upsert_vector' is deprecated and will be removed in a future version.

    This method constructs a Cypher query and asynchronously executes it
    to upsert (insert or update) a vector property on a specific node.

    Example:

    .. code-block:: python

        from neo4j import AsyncGraphDatabase
        from neo4j_graphrag.indexes import upsert_vector

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        # Connect to Neo4j database
        driver = AsyncGraphDatabase.driver(URI, auth=AUTH)

        # Upsert the vector data
        async_upsert_vector(
            driver,
            node_id="nodeId",
            embedding_property="vectorProperty",
            vector=...,
        )

    Args:
        driver (neo4j.AsyncDriver): Neo4j Python asynchronous driver instance.
        node_id (int): The element id of the node.
        embedding_property (str): The name of the property to store the vector in.
        vector (list[float]): The vector to store.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        Neo4jInsertionError: If upserting of the vector fails.
    """
    warnings.warn(
        "'async_upsert_vector' is deprecated and will be removed in a future version.",
        DeprecationWarning,
        stacklevel=2,
    )
    try:
        parameters = {
            "node_id": node_id,
            "embedding_property": embedding_property,
            "vector": vector,
        }
        await driver.execute_query(
            UPSERT_VECTOR_ON_NODE_QUERY, parameters, database_=neo4j_database
        )
    except neo4j.exceptions.ClientError as e:
        raise Neo4jInsertionError(
            f"Upserting vector to Neo4j failed: {e.message}"
        ) from e


async def async_upsert_vector_on_relationship(
    driver: neo4j.AsyncDriver,
    rel_id: int,
    embedding_property: str,
    vector: list[float],
    neo4j_database: Optional[str] = None,
) -> None:
    """
    .. warning::
        'async_upsert_vector_on_relationship' is deprecated and will be removed in a future version.

    This method constructs a Cypher query and asynchronously executes it
    to upsert (insert or update) a vector property on a specific relationship.

    Example:

    .. code-block:: python

        from neo4j import AsyncGraphDatabase
        from neo4j_graphrag.indexes import upsert_vector_on_relationship

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")

        # Connect to Neo4j database
        driver = AsyncGraphDatabase.driver(URI, auth=AUTH)

        # Upsert the vector data
        async_upsert_vector_on_relationship(
            driver,
            node_id="nodeId",
            embedding_property="vectorProperty",
            vector=...,
        )

    Args:
        driver (neo4j.AsyncDriver): Neo4j Python asynchronous driver instance.
        rel_id (int): The element id of the relationship.
        embedding_property (str): The name of the property to store the vector in.
        vector (list[float]): The vector to store.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        Neo4jInsertionError: If upserting of the vector fails.
    """
    warnings.warn(
        "'async_upsert_vector_on_relationship' is deprecated and will be removed in a future version.",
        DeprecationWarning,
        stacklevel=2,
    )
    try:
        parameters = {
            "rel_id": rel_id,
            "embedding_property": embedding_property,
            "vector": vector,
        }
        await driver.execute_query(
            UPSERT_VECTOR_ON_RELATIONSHIP_QUERY, parameters, database_=neo4j_database
        )
    except neo4j.exceptions.ClientError as e:
        raise Neo4jInsertionError(
            f"Upserting vector to Neo4j failed: {e.message}"
        ) from e


def _sort_by_index_name(
    records: List[neo4j.Record], index_name: str
) -> List[neo4j.Record]:
    """
    Sorts the provided list of dictionaries containing index information so
    that any item whose 'name' key matches the given 'index_name' appears at
    the front of the list.

    Args:
        records (List[Dict[str, Any]]): The list of records containing index
            information to sort.
        index_name (str): The index name to match against the 'name' key of
            each dictionary.

    Returns:
        List[Dict[str, Any]]: A newly sorted list with items matching
        'index_name' placed first.
    """
    return sorted(records, key=lambda x: x.get("name") != index_name)


def retrieve_vector_index_info(
    driver: neo4j.Driver,
    index_name: str,
    label_or_type: str,
    embedding_property: str,
    neo4j_database: Optional[str] = None,
) -> Optional[neo4j.Record]:
    """
    Check if a vector index exists in a Neo4j database and return its
    information. If no matching index is found, returns None.

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        index_name (str): The name of the index to look up.
        label_or_type (str): The label (for nodes) or type (for relationships)
            of the index.
        embedding_property (str): The name of the property containing the
            embeddings.
        neo4j_database (Optional[str]): The name of the Neo4j database.
            If not provided, this defaults to the server's default database ("neo4j" by default)
            (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Returns:
        Optional[Dict[str, Any]]:
            A dictionary containing the first matching index's information if found,
            or None otherwise.
    """
    result = driver.execute_query(
        query_=(
            "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, "
            "properties, options WHERE type = 'VECTOR' AND (name = $index_name "
            "OR (labelsOrTypes[0] = $label_or_type AND "
            "properties[0] = $embedding_property)) "
            "RETURN name, type, entityType, labelsOrTypes, properties, options"
        ),
        parameters_={
            "index_name": index_name,
            "label_or_type": label_or_type,
            "embedding_property": embedding_property,
        },
        database_=neo4j_database,
    )
    index_information = _sort_by_index_name(result.records, index_name)
    if len(index_information) > 0:
        return index_information[0]
    else:
        return None


def retrieve_fulltext_index_info(
    driver: neo4j.Driver,
    index_name: str,
    label_or_type: str,
    text_properties: List[str] = [],
    neo4j_database: Optional[str] = None,
) -> Optional[neo4j.Record]:
    """
    Check if a full text index exists in a Neo4j database and return its
    information. If no matching index is found, returns None.

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        index_name (str): The name of the index to look up.
        label_or_type (str): The label (for nodes) or type (for relationships)
            of the index.
        text_properties (List[str]): The names of the text properties indexed.
        neo4j_database (Optional[str]): The name of the Neo4j database.
            If not provided, this defaults to the server's default database ("neo4j" by default)
            (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Returns:
        Optional[Dict[str, Any]]:
            A dictionary containing the first matching index's information if found,
            or None otherwise.
    """
    result = driver.execute_query(
        query_=(
            "SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, options "
            "WHERE type = 'FULLTEXT' AND (name = $index_name "
            "OR (labelsOrTypes = [$label_or_type] AND "
            "properties = $text_properties)) "
            "RETURN name, type, entityType, labelsOrTypes, properties, options"
        ),
        parameters_={
            "index_name": index_name,
            "label_or_type": label_or_type,
            "text_properties": text_properties,
        },
        database_=neo4j_database,
    )
    index_information = _sort_by_index_name(result.records, index_name)
    if len(index_information) > 0:
        return index_information[0]
    else:
        return None
