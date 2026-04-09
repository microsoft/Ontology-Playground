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

from .hybrid import HybridCypherRetriever, HybridRetriever
from .text2cypher import Text2CypherRetriever
from .tools_retriever import ToolsRetriever
from .vector import VectorCypherRetriever, VectorRetriever

__all__ = [
    "VectorRetriever",
    "VectorCypherRetriever",
    "HybridRetriever",
    "HybridCypherRetriever",
    "Text2CypherRetriever",
    "ToolsRetriever",
]


try:
    from .external.pinecone.pinecone import PineconeNeo4jRetriever  # noqa: F401

    __all__.append("PineconeNeo4jRetriever")
except ImportError:
    pass


try:
    from .external.weaviate.weaviate import WeaviateNeo4jRetriever  # noqa: F401

    __all__.append("WeaviateNeo4jRetriever")
except ImportError:
    pass

try:
    from .external.qdrant.qdrant import QdrantNeo4jRetriever  # noqa: F401

    __all__.append("QdrantNeo4jRetriever")
except ImportError:
    pass
