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

from typing import TYPE_CHECKING, Any, Optional

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import EmbeddingsGenerationError
from neo4j_graphrag.utils.rate_limit import RateLimitHandler, rate_limit_handler

try:
    from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel
except (ImportError, AttributeError):
    TextEmbeddingModel = TextEmbeddingInput = None  # type: ignore[misc, assignment]


if TYPE_CHECKING:
    from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel


class VertexAIEmbeddings(Embedder):
    """
    Vertex AI embeddings class.
    This class uses the Vertex AI Python client to generate vector embeddings for text data.

    Args:
        model (str): The name of the Vertex AI text embedding model to use. Defaults to "text-embedding-004".
    """

    def __init__(
        self,
        model: str = "text-embedding-004",
        rate_limit_handler: Optional[RateLimitHandler] = None,
    ) -> None:
        if TextEmbeddingModel is None:
            raise ImportError(
                """Could not import Vertex AI Python client.
                Please install it with `pip install "neo4j-graphrag[google]"`."""
            )
        super().__init__(rate_limit_handler)
        self.model = TextEmbeddingModel.from_pretrained(model)

    @rate_limit_handler
    def embed_query(
        self, text: str, task_type: str = "RETRIEVAL_QUERY", **kwargs: Any
    ) -> list[float]:
        """
        Generate embeddings for a given query using a Vertex AI text embedding model.

        Args:
            text (str): The text to generate an embedding for.
            task_type (str): The type of the text embedding task. Defaults to "RETRIEVAL_QUERY". See https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api#tasktype for a full list.
            **kwargs (Any): Additional keyword arguments to pass to the Vertex AI client's get_embeddings method.
        """
        try:
            # type annotation needed for mypy
            inputs: list[str | TextEmbeddingInput] = [
                TextEmbeddingInput(text, task_type)
            ]
            embeddings = self.model.get_embeddings(inputs, **kwargs)
            return list(embeddings[0].values)
        except Exception as e:
            raise EmbeddingsGenerationError(
                f"Failed to generate embedding with VertexAI: {e}"
            ) from e
