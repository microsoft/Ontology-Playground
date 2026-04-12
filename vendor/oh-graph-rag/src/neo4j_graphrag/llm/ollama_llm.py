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

# built-in dependencies
from __future__ import annotations

import warnings
from typing import (
    TYPE_CHECKING,
    Any,
    Iterable,
    List,
    Optional,
    Sequence,
    Type,
    Union,
    cast,
    Dict,
    overload,
)

# 3rd-party dependencies
from pydantic import BaseModel, ValidationError

# project dependencies
from neo4j_graphrag.exceptions import LLMGenerationError
from neo4j_graphrag.message_history import MessageHistory
from neo4j_graphrag.types import LLMMessage
from neo4j_graphrag.utils.rate_limit import (
    RateLimitHandler,
)
from neo4j_graphrag.utils.rate_limit import (
    async_rate_limit_handler as async_rate_limit_handler_decorator,
)
from neo4j_graphrag.utils.rate_limit import (
    rate_limit_handler as rate_limit_handler_decorator,
)

from .base import LLMInterface, LLMInterfaceV2
from .types import (
    BaseMessage,
    LLMResponse,
    MessageList,
    ToolCall,
    ToolCallResponse,
    SystemMessage,
    UserMessage,
)
from neo4j_graphrag.tool import Tool

if TYPE_CHECKING:
    from ollama import Message

# pylint: disable=redefined-builtin, arguments-differ, raise-missing-from, no-else-return, import-outside-toplevel


class OllamaLLM(LLMInterface, LLMInterfaceV2):
    """LLM wrapper for Ollama models."""

    def __init__(
        self,
        model_name: str,
        model_params: Optional[dict[str, Any]] = None,
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ):
        try:
            import ollama
        except ImportError:
            raise ImportError(
                "Could not import ollama Python client. "
                "Please install it with `pip install ollama`."
            )
        LLMInterfaceV2.__init__(
            self,
            model_name=model_name,
            model_params=model_params or {},
            rate_limit_handler=rate_limit_handler,
            **kwargs,
        )
        self.ollama = ollama
        self.client = ollama.Client(
            **kwargs,
        )
        self.async_client = ollama.AsyncClient(
            **kwargs,
        )
        if "stream" in self.model_params:
            raise ValueError("Streaming is not supported by the OllamaLLM wrapper")
        # bug-fix with backward compatibility:
        # we mistakenly passed all "model_params" under the options argument
        # next two lines to be removed in 2.0
        if not any(
            key in self.model_params for key in ("options", "format", "keep_alive")
        ):
            warnings.warn(
                """Passing options directly without including them in an 'options' key is deprecated. Ie you must use model_params={"options": {"temperature": 0}}""",
                DeprecationWarning,
            )
            self.model_params = {"options": self.model_params}

    # overloads for LLMInterface and LLMInterfaceV2 methods
    @overload  # type: ignore[no-overload-impl]
    def invoke(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse: ...

    @overload
    def invoke(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse: ...

    @overload  # type: ignore[no-overload-impl]
    async def ainvoke(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse: ...

    @overload
    async def ainvoke(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse: ...

    # switching logics to LLMInterface or LLMInterfaceV2
    def invoke(  # type: ignore[no-redef]
        self,
        input: Union[str, List[LLMMessage]],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        if isinstance(input, str):
            return self.__invoke_v1(input, message_history, system_instruction)
        elif isinstance(input, list):
            return self.__invoke_v2(input, response_format=response_format, **kwargs)
        else:
            raise ValueError(f"Invalid input type for invoke method - {type(input)}")

    async def ainvoke(  # type: ignore[no-redef]
        self,
        input: Union[str, List[LLMMessage]],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        if isinstance(input, str):
            return await self.__ainvoke_v1(input, message_history, system_instruction)
        elif isinstance(input, list):
            return await self.__ainvoke_v2(
                input, response_format=response_format, **kwargs
            )
        else:
            raise ValueError(f"Invalid input type for ainvoke method - {type(input)}")

    @rate_limit_handler_decorator
    def __invoke_v1(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Sends text to the LLM and returns a response.

        Args:
            input (str): The text to send to the LLM.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            LLMResponse: The response from the LLM.
        """
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            response = self.client.chat(
                model=self.model_name,
                messages=self.get_messages(input, message_history, system_instruction),
                **self.model_params,
            )
            content = response.message.content or ""
            return LLMResponse(content=content)
        except self.ollama.ResponseError as e:
            raise LLMGenerationError(e)

    @rate_limit_handler_decorator
    def __invoke_v2(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Sends text to the LLM and returns a response.

        Args:
            input (List[LLMMessage]): The messages to send to the LLM.
            response_format: Not supported by OllamaLLM.

        Returns:
            LLMResponse: The response from the LLM.
        """
        if response_format is not None:
            raise NotImplementedError(
                "OllamaLLM does not currently support structured output"
            )
        try:
            response = self.client.chat(
                model=self.model_name,
                messages=self.get_messages_v2(input),
                **self.model_params,
                **kwargs,
            )
            content = response.message.content or ""
            return LLMResponse(content=content)
        except self.ollama.ResponseError as e:
            raise LLMGenerationError(e)

    @async_rate_limit_handler_decorator
    async def __ainvoke_v1(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Asynchronously sends a text input to the OpenAI chat
        completion model and returns the response's content.

        Args:
            input (str): Text sent to the LLM.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            LLMResponse: The response from OpenAI.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            response = await self.async_client.chat(
                model=self.model_name,
                messages=self.get_messages(input, message_history, system_instruction),
                options=self.model_params,
            )
            content = response.message.content or ""
            return LLMResponse(content=content)
        except self.ollama.ResponseError as e:
            raise LLMGenerationError(e)

    @async_rate_limit_handler_decorator
    async def __ainvoke_v2(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Asynchronously sends a text input to the Ollama chat
        completion model and returns the response's content.

        Args:
            input (List[LLMMessage]): Messages sent to the LLM.
            response_format: Not supported by OllamaLLM.

        Returns:
            LLMResponse: The response from Ollama.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        if response_format is not None:
            raise NotImplementedError(
                "OllamaLLM does not currently support structured output"
            )
        try:
            params = {**self.model_params, **kwargs}
            response = await self.async_client.chat(
                model=self.model_name,
                messages=self.get_messages_v2(input),
                options=params,
            )
            content = response.message.content or ""
            return LLMResponse(content=content)
        except self.ollama.ResponseError as e:
            raise LLMGenerationError(e)

    # subsdiary methods
    def get_messages(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> Sequence[Message]:
        """Constructs the message list for the Ollama chat API."""
        messages = []
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction).model_dump())
        if message_history:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            try:
                MessageList(messages=cast(list[BaseMessage], message_history))
            except ValidationError as e:
                raise LLMGenerationError(e.errors()) from e
            messages.extend(cast(Iterable[dict[str, Any]], message_history))
        messages.append(UserMessage(content=input).model_dump())
        return messages  # type: ignore

    def get_messages_v2(
        self,
        input: list[LLMMessage],
    ) -> Sequence[Message]:
        """Constructs the message list for the Ollama chat API."""
        return [self.ollama.Message(**i) for i in input]

    @rate_limit_handler_decorator
    def invoke_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],  # Tools definition as a sequence of Tool objects
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        """Sends a text input to the LLM with tool definitions
        and retrieves a tool call response.
        Args:
            input (str): Text sent to the LLM.
            tools (List[Tool]): List of Tools for the LLM to choose from.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.
        Returns:
            ToolCallResponse: The response from the LLM containing a tool call.
        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages

            # Convert tools to Ollama's expected type
            ollama_tools = []
            for tool in tools:
                ollama_tool_format = self._convert_tool_to_ollama_format(tool)
                ollama_tools.append(ollama_tool_format)
            response = self.client.chat(
                model=self.model_name,
                messages=self.get_messages(input, message_history, system_instruction),
                tools=ollama_tools,
                **self.model_params,
            )
            message = response.message
            # If there's no tool call, return the content as a regular response
            if not message.tool_calls or len(message.tool_calls) == 0:
                return ToolCallResponse(
                    tool_calls=[],
                    content=message.content,
                )

            # Process all tool calls
            tool_calls = []

            for tool_call in message.tool_calls:
                args = tool_call.function.arguments
                tool_calls.append(
                    ToolCall(name=tool_call.function.name, arguments=args)
                )

            return ToolCallResponse(tool_calls=tool_calls, content=message.content)
        except self.ollama.ResponseError as e:
            raise LLMGenerationError(e)

    @async_rate_limit_handler_decorator
    async def ainvoke_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],  # Tools definition as a sequence of Tool objects
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        """Sends a text input to the LLM with tool definitions
        and retrieves a tool call response.
        Args:
            input (str): Text sent to the LLM.
            tools (List[Tool]): List of Tools for the LLM to choose from.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.
        Returns:
            ToolCallResponse: The response from the LLM containing a tool call.
        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages

            # Convert tools to Ollama's expected type
            ollama_tools = []
            for tool in tools:
                ollama_tool_format = self._convert_tool_to_ollama_format(tool)
                ollama_tools.append(ollama_tool_format)

            response = await self.async_client.chat(
                model=self.model_name,
                messages=self.get_messages(input, message_history, system_instruction),
                tools=ollama_tools,
                **self.model_params,
            )
            message = response.message

            # If there's no tool call, return the content as a regular response
            if not message.tool_calls or len(message.tool_calls) == 0:
                return ToolCallResponse(
                    tool_calls=[],
                    content=message.content,
                )

            # Process all tool calls
            tool_calls = []

            for tool_call in message.tool_calls:
                args = tool_call.function.arguments
                tool_calls.append(
                    ToolCall(name=tool_call.function.name, arguments=args)
                )

            return ToolCallResponse(tool_calls=tool_calls, content=message.content)
        except self.ollama.ResponseError as e:
            raise LLMGenerationError(e)

    def _convert_tool_to_ollama_format(self, tool: Tool) -> Dict[str, Any]:
        """Convert a Tool object to Ollama's expected format.
        Args:
            tool: A Tool object to convert to Ollama's format.
        Returns:
            A dictionary in Ollama's tool format.
        """
        try:
            return {
                "type": "function",
                "function": {
                    "name": tool.get_name(),
                    "description": tool.get_description(),
                    "parameters": tool.get_parameters(),
                },
            }
        except AttributeError:
            raise LLMGenerationError(f"Tool {tool} is not a valid Tool object")
