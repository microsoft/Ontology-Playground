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
from typing import Optional

import neo4j


def get_version(
    driver: neo4j.Driver, database: Optional[str] = None
) -> tuple[tuple[int, ...], bool, bool]:
    """
    Retrieves the Neo4j database version and checks if it is running on the Aura platform.

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance to execute the query.
        database (str, optional): The name of the Neo4j database to query. Defaults to None.

    Returns:
        tuple[tuple[int, ...], bool]:
            - A tuple of integers representing the database version (major, minor, patch) or
                (year, month, patch)  for later versions.
            - A boolean indicating whether the database is hosted on the Aura platform.
            - A boolean indicating whether the database is running the enterprise edition.
    """
    records, _, _ = driver.execute_query(
        "CALL dbms.components()",
        database_=database,
        routing_=neo4j.RoutingControl.READ,
    )
    version = records[0]["versions"][0]
    edition = records[0]["edition"]
    # drop everything after the '-' first
    version_main, *_ = version.split("-")
    # convert each number between '.' into int
    version_tuple = tuple(map(int, version_main.split(".")))
    # if no patch version, consider it's 0
    if len(version_tuple) < 3:
        version_tuple = (*version_tuple, 0)
    return version_tuple, "aura" in version, edition == "enterprise"


def is_version_5_23_or_above(version_tuple: tuple[int, ...]) -> bool:
    """
    Determines if the Neo4j database version is 5.23 or above.

    Args:
        version_tuple (tuple[int, ...]): A tuple of integers representing the database version
            (major, minor, patch) or (year, month, patch) for later versions.

    Returns:
        bool: True if the version is 5.23.0 or above, False otherwise.
    """
    return version_tuple >= (5, 23, 0)


def is_version_5_24_or_above(version_tuple: tuple[int, ...]) -> bool:
    """
    Determines if the Neo4j database version is 5.24 or above.

    Dynamic label syntax (SET n:$(labels)) was introduced in Neo4j 5.24,
    replacing the deprecated apoc.create.addLabels procedure.

    Args:
        version_tuple (tuple[int, ...]): A tuple of integers representing the database version
            (major, minor, patch) or (year, month, patch) for later versions.

    Returns:
        bool: True if the version is 5.24.0 or above, False otherwise.
    """
    return version_tuple >= (5, 24, 0)


def has_vector_index_support(version_tuple: tuple[int, ...]) -> bool:
    """
    Checks if a Neo4j database supports vector indexing based on its version and platform.

    Args:
        version_tuple (neo4j.Driver): A tuple of integers representing the database version (major, minor, patch) or
                (year, month, patch)  for later versions.

    Returns:
        bool: True if the connected Neo4j database version supports vector indexing, False otherwise.
    """
    return version_tuple >= (5, 11, 0)


def has_metadata_filtering_support(
    version_tuple: tuple[int, ...], is_aura: bool
) -> bool:
    """
    Checks if a Neo4j database supports vector index metadata filtering based on its version and platform.

    Args:
        version_tuple (neo4j.Driver): A tuple of integers representing the database version (major, minor, patch) or
                (year, month, patch)  for later versions.
        is_aura (bool): A boolean indicating whether the database is hosted on the Aura platform.

    Returns:
        bool: True if the connected Neo4j database version supports vector index metadata filtering , False otherwise.
    """
    if is_aura:
        target_version = (5, 18, 0)
    else:
        target_version = (5, 18, 1)

    return version_tuple >= target_version
