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
import warnings
from typing import Any

from .anthropic_llm import AnthropicLLM
from .base import LLMInterface, LLMInterfaceV2
from .cohere_llm import CohereLLM
from .mistralai_llm import MistralAILLM
from .ollama_llm import OllamaLLM
from .openai_llm import AzureOpenAILLM, OpenAILLM
from .types import LLMResponse
from .vertexai_llm import VertexAILLM


__all__ = [
    "AnthropicLLM",
    "CohereLLM",
    "LLMResponse",
    "LLMInterface",
    "LLMInterfaceV2",
    "OllamaLLM",
    "OpenAILLM",
    "VertexAILLM",
    "AzureOpenAILLM",
    "MistralAILLM",
]


def __getattr__(name: str) -> Any:
    """Handle deprecated imports with warnings."""
    from neo4j_graphrag.utils.rate_limit import (
        RateLimitHandler,
        NoOpRateLimitHandler,
        RetryRateLimitHandler,
        rate_limit_handler,
        async_rate_limit_handler,
        is_rate_limit_error,
        convert_to_rate_limit_error,
        DEFAULT_RATE_LIMIT_HANDLER,
    )

    deprecated_items = {
        "RateLimitHandler": RateLimitHandler,
        "NoOpRateLimitHandler": NoOpRateLimitHandler,
        "RetryRateLimitHandler": RetryRateLimitHandler,
        "rate_limit_handler": rate_limit_handler,
        "async_rate_limit_handler": async_rate_limit_handler,
        "is_rate_limit_error": is_rate_limit_error,
        "convert_to_rate_limit_error": convert_to_rate_limit_error,
        "DEFAULT_RATE_LIMIT_HANDLER": DEFAULT_RATE_LIMIT_HANDLER,
    }

    if name in deprecated_items:
        warnings.warn(
            f"{name} has been moved to neo4j_graphrag.utils.rate_limit. "
            f"Please update your imports to use 'from neo4j_graphrag.utils.rate_limit import {name}'.",
            DeprecationWarning,
            stacklevel=2,
        )
        return deprecated_items[name]

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
