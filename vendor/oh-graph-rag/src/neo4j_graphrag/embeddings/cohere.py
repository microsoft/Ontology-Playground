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

from typing import Any, Optional

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import EmbeddingsGenerationError
from neo4j_graphrag.utils.rate_limit import RateLimitHandler, rate_limit_handler

try:
    import cohere
except ImportError:
    cohere = None  # type: ignore


class CohereEmbeddings(Embedder):
    def __init__(
        self,
        model: str = "",
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ) -> None:
        if cohere is None:
            raise ImportError(
                """Could not import cohere python client.
                Please install it with `pip install "neo4j-graphrag[cohere]"`."""
            )
        super().__init__(rate_limit_handler)
        self.model = model
        self.client = cohere.Client(**kwargs)

    @rate_limit_handler
    def embed_query(self, text: str, **kwargs: Any) -> list[float]:
        try:
            response = self.client.embed(
                texts=[text],
                model=self.model,
                **kwargs,
            )
            return response.embeddings[0]  # type: ignore
        except Exception as e:
            raise EmbeddingsGenerationError(
                f"Failed to generate embedding with Cohere: {e}"
            ) from e
