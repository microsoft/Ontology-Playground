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

from typing import Callable, Optional

import neo4j
from pydantic import (
    BaseModel,
    ConfigDict,
    field_validator,
)
from qdrant_client import QdrantClient

from neo4j_graphrag.types import (
    EmbedderModel,
    Neo4jDriverModel,
    RetrieverResultItem,
)


class QdrantClientModel(BaseModel):
    client: QdrantClient
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("client")
    def check_client(cls, value: QdrantClient) -> QdrantClient:
        if not isinstance(value, QdrantClient):
            raise ValueError("Provided client needs to be of type QdrantClient")
        return value


class QdrantNeo4jRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    client_model: QdrantClientModel
    collection_name: str
    id_property_external: str
    id_property_neo4j: str
    using: Optional[str] = None
    embedder_model: Optional[EmbedderModel] = None
    return_properties: Optional[list[str]] = None
    retrieval_query: Optional[str] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    neo4j_database: Optional[str] = None
    node_label_neo4j: Optional[str] = None
