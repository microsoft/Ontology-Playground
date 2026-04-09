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

import os
from typing import Any, Optional

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import EmbeddingsGenerationError
from neo4j_graphrag.utils.rate_limit import RateLimitHandler, rate_limit_handler

try:
    from mistralai import Mistral
except ImportError:
    Mistral = None  # type: ignore


class MistralAIEmbeddings(Embedder):
    """
    Mistral AI embeddings class.
    This class uses the Mistral AI Python client to generate vector embeddings for text data.

    Args:
        model (str): The name of the Mistral AI text embedding model to use. Defaults to "mistral-embed".
    """

    def __init__(
        self,
        model: str = "mistral-embed",
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ) -> None:
        if Mistral is None:
            raise ImportError(
                """Could not import mistralai.
                Please install it with `pip install "neo4j-graphrag[mistralai]"`."""
            )
        super().__init__(rate_limit_handler)
        api_key = kwargs.pop("api_key", None)
        if api_key is None:
            api_key = os.getenv("MISTRAL_API_KEY", "")
        self.model = model
        self.mistral_client = Mistral(api_key=api_key, **kwargs)

    @rate_limit_handler
    def embed_query(self, text: str, **kwargs: Any) -> list[float]:
        """
        Generate embeddings for a given query using a Mistral AI text embedding model.

        Args:
            text (str): The text to generate an embedding for.
            **kwargs (Any): Additional keyword arguments to pass to the Mistral AI client.
        """
        try:
            embeddings_batch_response = self.mistral_client.embeddings.create(
                model=self.model, inputs=[text], **kwargs
            )
        except Exception as e:
            raise EmbeddingsGenerationError(
                f"Failed to generate embedding with MistralAI: {e}"
            ) from e

        if embeddings_batch_response is None or not embeddings_batch_response.data:
            raise EmbeddingsGenerationError("Failed to retrieve embeddings.")

        embedding = embeddings_batch_response.data[0].embedding

        if not isinstance(embedding, list):
            raise EmbeddingsGenerationError("Embedding is not a list of floats.")

        return embedding
