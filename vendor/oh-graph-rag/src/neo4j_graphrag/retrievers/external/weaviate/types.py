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
from weaviate.client import WeaviateClient
from weaviate.collections.classes.filters import _Filters

from neo4j_graphrag.types import (
    EmbedderModel,
    Neo4jDriverModel,
    RetrieverResultItem,
    VectorSearchModel,
)


class WeaviateModel(BaseModel):
    client: WeaviateClient
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("client")
    def check_client(cls, value: WeaviateClient) -> WeaviateClient:
        if not isinstance(value, WeaviateClient):
            raise TypeError(
                "Provided client needs to be of type weaviate.client.WeaviateClient"
            )
        return value


class WeaviateNeo4jRetrieverModel(BaseModel):
    driver_model: Neo4jDriverModel
    client_model: WeaviateModel
    collection: str
    id_property_external: str
    id_property_neo4j: str
    embedder_model: Optional[EmbedderModel]
    return_properties: Optional[list[str]] = None
    retrieval_query: Optional[str] = None
    result_formatter: Optional[Callable[[neo4j.Record], RetrieverResultItem]] = None
    neo4j_database: Optional[str] = None
    node_label_neo4j: Optional[str] = None


class WeaviateNeo4jSearchModel(VectorSearchModel):
    weaviate_filters: Optional[_Filters] = None
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("weaviate_filters")
    def check_weaviate_filters(cls, value: _Filters) -> _Filters:
        if value and not isinstance(value, _Filters):
            raise TypeError(
                "Provided filters need to be of type weaviate.collections.classes.filters._Filters"
            )
        return value
