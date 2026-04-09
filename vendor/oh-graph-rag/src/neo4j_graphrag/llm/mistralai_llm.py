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
from typing import Any, Iterable, List, Optional, Type, Union, cast, overload

from pydantic import BaseModel, ValidationError

from neo4j_graphrag.exceptions import LLMGenerationError
from neo4j_graphrag.llm.base import LLMInterface, LLMInterfaceV2
from neo4j_graphrag.llm.types import (
    BaseMessage,
    LLMResponse,
    MessageList,
    SystemMessage,
    UserMessage,
)
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

try:
    from mistralai import (
        AssistantMessage,
        Messages,
        Mistral,
    )
    from mistralai import (
        SystemMessage as MistralSystemMessage,
    )
    from mistralai import (
        UserMessage as MistralUserMessage,
    )
    from mistralai.models.sdkerror import SDKError
except ImportError:
    Mistral = None  # type: ignore
    SDKError = None  # type: ignore


# pylint: disable=redefined-builtin, arguments-differ, raise-missing-from, no-else-return
class MistralAILLM(LLMInterface, LLMInterfaceV2):
    def __init__(
        self,
        model_name: str,
        model_params: Optional[dict[str, Any]] = None,
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ):
        """

        Args:
            model_name (str):
            model_params (str): Parameters for LLMInterface(V1) like temperature and such that will be
             passed to the chat completions endpoint
            rate_limit_handler (Optional[RateLimitHandler]): Handler for rate limiting for LLMInterface(V1). Defaults to retry with exponential backoff.
            kwargs: All other parameters will be passed to the Mistral client.

        """
        if Mistral is None:
            raise ImportError(
                """Could not import Mistral Python client.
                Please install it with `pip install "neo4j-graphrag[mistralai]"`."""
            )
        LLMInterfaceV2.__init__(
            self,
            model_name=model_name,
            model_params=model_params or {},
            rate_limit_handler=rate_limit_handler,
            **kwargs,
        )
        api_key = kwargs.pop("api_key", None)
        if api_key is None:
            api_key = os.getenv("MISTRAL_API_KEY", "")
        self.client = Mistral(api_key=api_key, **kwargs)

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

    # implementations
    @rate_limit_handler_decorator
    def __invoke_v1(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Sends a text input to the Mistral chat completion model
        and returns the response's content.

        Args:
            input (str): Text sent to the LLM.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages, with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            LLMResponse: The response from MistralAI.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            messages = self.get_messages(input, message_history, system_instruction)
            response = self.client.chat.complete(
                model=self.model_name,
                messages=messages,
                **self.model_params,
            )
            content: str = ""
            if response and response.choices:
                possible_content = response.choices[0].message.content
                if isinstance(possible_content, str):
                    content = possible_content
            return LLMResponse(content=content)
        except SDKError as e:
            raise LLMGenerationError(e)

    def __invoke_v2(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Sends a text input to the Mistral chat completion model
        and returns the response's content.

        Args:
            input (List[LLMMessage]): Messages sent to the LLM.
            response_format: Not supported by MistralAILLM.

        Returns:
            LLMResponse: The response from MistralAI.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        if response_format is not None:
            raise NotImplementedError(
                "MistralAILLM does not currently support structured output"
            )
        try:
            messages = self.get_messages_v2(input)
            response = self.client.chat.complete(
                model=self.model_name, messages=messages, **self.model_params, **kwargs
            )
            content: str = ""
            if response and response.choices:
                possible_content = response.choices[0].message.content
                if isinstance(possible_content, str):
                    content = possible_content
            return LLMResponse(content=content)
        except SDKError as e:
            raise LLMGenerationError(e)

    @async_rate_limit_handler_decorator
    async def __ainvoke_v1(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Asynchronously sends a text input to the MistralAI chat
        completion model and returns the response's content.

        Args:
            input (str): Text sent to the LLM.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection previous messages,
                with each message having a specific role assigned.
            system_instruction (Optional[str]): An option to override the llm system message for this invocation.

        Returns:
            LLMResponse: The response from MistralAI.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            messages = self.get_messages(input, message_history, system_instruction)
            response = await self.client.chat.complete_async(
                model=self.model_name,
                messages=messages,
                **self.model_params,
            )
            content: str = ""
            if response and response.choices:
                possible_content = response.choices[0].message.content
                if isinstance(possible_content, str):
                    content = possible_content
            return LLMResponse(content=content)
        except SDKError as e:
            raise LLMGenerationError(e)

    async def __ainvoke_v2(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Asynchronously sends a text input to the MistralAI chat
        completion model and returns the response's content.

        Args:
            input (List[LLMMessage]): Messages sent to the LLM.
            response_format: Not supported by MistralAILLM.

        Returns:
            LLMResponse: The response from MistralAI.

        Raises:
            LLMGenerationError: If anything goes wrong.
        """
        if response_format is not None:
            raise NotImplementedError(
                "MistralAILLM does not currently support structured output"
            )
        try:
            messages = self.get_messages_v2(input)
            response = await self.client.chat.complete_async(
                model=self.model_name,
                messages=messages,
                **self.model_params,
                **kwargs,
            )
            content: str = ""
            if response and response.choices:
                possible_content = response.choices[0].message.content
                if isinstance(possible_content, str):
                    content = possible_content
            return LLMResponse(content=content)
        except SDKError as e:
            raise LLMGenerationError(e)

    # subsidiary methods
    def get_messages(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> list[Messages]:
        """Constructs the message list for the Mistral chat completion model."""
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
        return cast(list[Messages], messages)

    def get_messages_v2(
        self,
        input: list[LLMMessage],
    ) -> list[Messages]:
        """Constructs the message list for the Mistral chat completion model."""
        messages: list[Messages] = []
        for m in input:
            if m["role"] == "system":
                messages.append(MistralSystemMessage(content=m["content"]))
                continue
            if m["role"] == "user":
                messages.append(MistralUserMessage(content=m["content"]))
                continue
            if m["role"] == "assistant":
                messages.append(AssistantMessage(content=m["content"]))
                continue
            raise ValueError(f"Unknown role: {m['role']}")
        return messages
