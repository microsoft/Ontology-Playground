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
from abc import ABC, abstractmethod
from typing import Any, List, Optional, Sequence, Type, Union

from pydantic import BaseModel

from neo4j_graphrag.message_history import MessageHistory
from neo4j_graphrag.tool import Tool
from neo4j_graphrag.types import LLMMessage
from neo4j_graphrag.utils.rate_limit import (
    DEFAULT_RATE_LIMIT_HANDLER,
    RateLimitHandler,
)

from .types import LLMResponse, ToolCallResponse

# pylint: disable=redefined-builtin

logger = logging.getLogger(__name__)


class LLMInterface(ABC):
    """Interface for large language models.

    Args:
        model_name (str): The name of the language model.
        model_params (Optional[dict]): Additional parameters passed to the model when text is sent to it. Defaults to None.
        rate_limit_handler (Optional[RateLimitHandler]): Handler for rate limiting. Defaults to retry with exponential backoff.
        **kwargs (Any): Arguments passed to the model when for the class is initialised. Defaults to None.
    """

    supports_structured_output: bool = False
    """Whether this LLM supports structured output (response_format with Pydantic models or json schema)."""

    def __init__(
        self,
        model_name: str,
        model_params: Optional[dict[str, Any]] = None,
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ):
        logger.warning(
            "LLMInterface is deprecated and will be removed in future versions. Please use LLMInterfaceV2 instead."
        )
        self.model_name = model_name
        self.model_params = model_params or {}

        if rate_limit_handler is not None:
            self._rate_limit_handler = rate_limit_handler
        else:
            self._rate_limit_handler = DEFAULT_RATE_LIMIT_HANDLER

    @abstractmethod
    def invoke(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Sends a text input to the LLM and retrieves a response.

        Args:
            input (str): Text sent to the LLM.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            LLMResponse: The response from the LLM.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """

    @abstractmethod
    async def ainvoke(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Asynchronously sends a text input to the LLM and retrieves a response.

        Args:
            input (str): Text sent to the LLM.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            LLMResponse: The response from the LLM.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """

    def invoke_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        """Sends a text input to the LLM with tool definitions and retrieves a tool call response.

        This is a default implementation that should be overridden by LLM providers that support tool/function calling.

        Args:
            input (str): Text sent to the LLM.
            tools (Sequence[Tool]): Sequence of Tools for the LLM to choose from. Each LLM implementation should handle the conversion to its specific format.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            ToolCallResponse: The response from the LLM containing a tool call.

        Raises:
            LLMGenerationError: If anything goes wrong.
            NotImplementedError: If the LLM provider does not support tool calling.
        """
        raise NotImplementedError("This LLM provider does not support tool calling.")

    async def ainvoke_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        """Asynchronously sends a text input to the LLM with tool definitions and retrieves a tool call response.

        This is a default implementation that should be overridden by LLM providers that support tool/function calling.

        Args:
            input (str): Text sent to the LLM.
            tools (Sequence[Tool]): Sequence of Tools for the LLM to choose from. Each LLM implementation should handle the conversion to its specific format.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            ToolCallResponse: The response from the LLM containing a tool call.

        Raises:
            LLMGenerationError: If anything goes wrong.
            NotImplementedError: If the LLM provider does not support tool calling.
        """
        raise NotImplementedError("This LLM provider does not support tool calling.")


class LLMInterfaceV2(ABC):
    """Interface for large language models compatible with LangChain.

    Args:
        model_name (str): The name of the language model.
        model_params (Optional[dict]): Additional parameters passed to the model when text is sent to it. Defaults to None.
        rate_limit_handler (Optional[RateLimitHandler]): Handler for rate limiting. Defaults to retry with exponential backoff.
        **kwargs (Any): Arguments passed to the model when for the class is initialised. Defaults to None.
    """

    def __init__(
        self,
        model_name: str,
        model_params: Optional[dict[str, Any]] = None,
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ):
        self.model_name = model_name
        self.model_params = model_params or {}

        if rate_limit_handler is not None:
            self._rate_limit_handler = rate_limit_handler
        else:
            self._rate_limit_handler = DEFAULT_RATE_LIMIT_HANDLER

    @abstractmethod
    def invoke(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Sends a list of messages to the LLM and retrieves a response.

        Args:
            input (List[LLMMessage]): Text sent to the LLM as a list of LLMMessage objects.
            response_format (Optional[Union[Type[BaseModel], dict[str, Any]]]): Optional
                response format specification. Can be a Pydantic model class for structured
                output or a dict for provider-specific formats. Defaults to None.

        Returns:
            LLMResponse: The response from the LLM.

        Raises:
            LLMGenerationError: If anything goes wrong.
            NotImplementedError: If the LLM provider does not support structured output.
        """

    @abstractmethod
    async def ainvoke(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Asynchronously sends a list of messages to the LLM and retrieves a response.

        Args:
            input (List[LLMMessage]): List of messages sent to the LLM.
            response_format (Optional[Union[Type[BaseModel], dict[str, Any]]]): Optional
                response format specification. Can be a Pydantic model class for structured
                output or a dict for provider-specific formats. Defaults to None.

        Returns:
            LLMResponse: The response from the LLM.

        Raises:
            LLMGenerationError: If anything goes wrong.
            NotImplementedError: If the LLM provider does not support structured output.
        """
