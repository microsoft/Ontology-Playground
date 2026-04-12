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

from abc import ABC, abstractmethod
from typing import Optional

from neo4j_graphrag.utils.rate_limit import (
    DEFAULT_RATE_LIMIT_HANDLER,
    RateLimitHandler,
)


class Embedder(ABC):
    """
    Interface for embedding models.
    An embedder passed into a retriever must implement this interface.

    Args:
        rate_limit_handler (Optional[RateLimitHandler]): Handler for rate limiting. Defaults to retry with exponential backoff.
    """

    def __init__(self, rate_limit_handler: Optional[RateLimitHandler] = None):
        if rate_limit_handler is not None:
            self._rate_limit_handler = rate_limit_handler
        else:
            self._rate_limit_handler = DEFAULT_RATE_LIMIT_HANDLER

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        """Embed query text.

        Args:
            text (str): Text to convert to vector embedding

        Returns:
            list[float]: A vector embedding.
        """

    async def async_embed_query(self, text: str) -> list[float]:
        """Asynchronously embed query text.

        Args:
            text (str): Text to convert to vector embedding

        Returns:
            list[float]: A vector embedding.
        """
        return self.embed_query(text)
