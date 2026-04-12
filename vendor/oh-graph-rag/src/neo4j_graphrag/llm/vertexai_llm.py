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

import inspect
import logging
from typing import Any, List, Optional, Sequence, Type, Union, cast, overload

# 3rd party dependencies
from pydantic import BaseModel, ValidationError

# project dependencies
from neo4j_graphrag.exceptions import LLMGenerationError
from neo4j_graphrag.llm.base import LLMInterface, LLMInterfaceV2
from neo4j_graphrag.llm.types import (
    BaseMessage,
    LLMResponse,
    MessageList,
    ToolCall,
    ToolCallResponse,
)
from neo4j_graphrag.message_history import MessageHistory
from neo4j_graphrag.tool import Tool
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
    from vertexai.generative_models import (
        Content,
        FunctionCall,
        FunctionDeclaration,
        GenerationResponse,
        GenerativeModel,
        Part,
        ResponseValidationError,
        ToolConfig,
    )
    from vertexai.generative_models import (
        Tool as VertexAITool,
    )
except ImportError:
    GenerativeModel = None  # type: ignore[misc, assignment]
    ResponseValidationError = None  # type: ignore[misc, assignment]

logger = logging.getLogger(__name__)

# Params to exclude when extracting from GenerationConfig for structured output
_GENERATION_CONFIG_SCHEMA_PARAMS = {"response_schema", "response_mime_type"}


def _extract_generation_config_params(
    config: Any, exclude_schema: bool = True
) -> dict[str, Any]:
    """Extract valid parameters from a GenerationConfig object.

    This function extracts parameters from the internal _raw_generation_config
    protobuf and returns them as a dict that can be passed to GenerationConfig().

    Args:
        config: A GenerationConfig object
        exclude_schema: If True, excludes response_schema and response_mime_type

    Returns:
        Dict of parameter name to value for non-empty params
    """
    from vertexai.generative_models import GenerationConfig

    if not hasattr(config, "_raw_generation_config"):
        return {}

    raw = config._raw_generation_config

    # Get valid params from GenerationConfig signature
    sig = inspect.signature(GenerationConfig.__init__)
    valid_params = {
        name
        for name, _ in sig.parameters.items()
        if name != "self"
        and (not exclude_schema or name not in _GENERATION_CONFIG_SCHEMA_PARAMS)
    }

    preserved = {}
    for param in valid_params:
        val = getattr(raw, param, None)
        if val:  # Only include non-empty values
            # Convert repeated fields (like stop_sequences) to lists
            if hasattr(val, "__iter__") and not isinstance(val, (str, bytes, dict)):
                val = list(val)
            preserved[param] = val

    return preserved


# pylint: disable=arguments-differ, redefined-builtin, no-else-return
class VertexAILLM(LLMInterface, LLMInterfaceV2):
    """Interface for large language models on Vertex AI

    Args:
        model_name (str, optional): Name of the LLM to use. Defaults to "gemini-1.5-flash-001".
        model_params (Optional[dict], optional): Additional parameters for LLMInterface(V1) passed to the model when text is sent to it. Defaults to None.
        system_instruction: Optional[str], optional): Additional instructions for setting the behavior and context for the model in a conversation. Defaults to None.
        rate_limit_handler (Optional[RateLimitHandler], optional): Rate limit handler for LLMInterface(V1). Defaults to None.
        **kwargs (Any): Arguments passed to the model when for the class is initialised. Defaults to None.

    Raises:
        LLMGenerationError: If there's an error generating the response from the model.

    Example:

    .. code-block:: python

        from neo4j_graphrag.llm import VertexAILLM
        from vertexai.generative_models import GenerationConfig

        generation_config = GenerationConfig(temperature=0.0)
        llm = VertexAILLM(
            model_name="gemini-1.5-flash-001", generation_config=generation_config
        )
        llm.invoke("Who is the mother of Paul Atreides?")
    """

    supports_structured_output: bool = True

    def __init__(
        self,
        model_name: str = "gemini-1.5-flash-001",
        model_params: Optional[dict[str, Any]] = None,
        system_instruction: Optional[str] = None,
        rate_limit_handler: Optional[RateLimitHandler] = None,
        **kwargs: Any,
    ):
        if GenerativeModel is None or ResponseValidationError is None:
            raise ImportError(
                """Could not import Vertex AI Python client.
                Please install it with `pip install "neo4j-graphrag[google]"`."""
            )
        LLMInterfaceV2.__init__(
            self,
            model_name=model_name,
            model_params=model_params or {},
            rate_limit_handler=rate_limit_handler,
        )
        self.model_name = model_name
        self.system_instruction = system_instruction
        self.options = kwargs

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

    def invoke_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],  # Tools definition as a sequence of Tool objects
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        return self.__invoke_v1_with_tools(
            input, tools, message_history, system_instruction
        )

    async def ainvoke_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        return await self.__ainvoke_v1_with_tools(
            input, tools, message_history, system_instruction
        )

    # legacy and brand new implementations

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
        model = self._get_model(
            system_instruction=system_instruction,
        )
        try:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            options = self._get_call_params(input, message_history, tools=None)
            response = model.generate_content(**options)
            return self._parse_content_response(response)
        except ResponseValidationError as e:
            raise LLMGenerationError("Error calling VertexAILLM") from e

    def __invoke_v2(
        self,
        input: List[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """New invoke method for LLMInterfaceV2.

        Args:
            input (List[LLMMessage]): Input to the LLM.
            response_format (Optional[Union[Type[BaseModel], dict[str, Any]]]): Optional
                response format. Can be a Pydantic model class for structured output
                or a JSON schema dict.
            **kwargs: Additional parameters to pass to GenerationConfig (e.g., temperature,
                max_output_tokens, top_p, top_k). These override constructor values.

        Returns:
            LLMResponse: The response from the LLM.
        """
        system_instruction, messages = self.get_messages_v2(input)
        model = self._get_model(
            system_instruction=system_instruction,
        )
        try:
            options = self._get_call_params_v2(
                messages, tools=None, response_format=response_format, **kwargs
            )
            response = model.generate_content(**options)
            return self._parse_content_response(response)
        except ResponseValidationError as e:
            raise LLMGenerationError("Error calling VertexAILLM") from e

    @async_rate_limit_handler_decorator
    async def __ainvoke_v1(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> LLMResponse:
        """Asynchronously sends text to the LLM and returns a response.

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
            model = self._get_model(
                system_instruction=system_instruction,
            )
            options = self._get_call_params(input, message_history, tools=None)
            response = await model.generate_content_async(**options)
            return self._parse_content_response(response)
        except ResponseValidationError as e:
            raise LLMGenerationError("Error calling VertexAILLM") from e

    async def __ainvoke_v2(
        self,
        input: list[LLMMessage],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Asynchronously sends text to the LLM and returns a response.

        Args:
            input (List[LLMMessage]): Input to the LLM.
            response_format (Optional[Union[Type[BaseModel], dict[str, Any]]]): Optional
                response format. Can be a Pydantic model class for structured output
                or a JSON schema dict.
            **kwargs: Additional parameters to pass to GenerationConfig (e.g., temperature,
                max_output_tokens, top_p, top_k). These override constructor values.

        Returns:
            LLMResponse: The response from the LLM.
        """
        try:
            system_instruction, messages = self.get_messages_v2(input)
            model = self._get_model(
                system_instruction=system_instruction,
            )
            options = self._get_call_params_v2(
                messages, tools=None, response_format=response_format, **kwargs
            )
            response = await model.generate_content_async(**options)
            return self._parse_content_response(response)
        except ResponseValidationError as e:
            raise LLMGenerationError("Error calling VertexAILLM") from e

    def __invoke_v1_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        response = self._call_llm(
            input,
            message_history=message_history,
            system_instruction=system_instruction,
            tools=tools,
        )
        return self._parse_tool_response(response)

    async def __ainvoke_v1_with_tools(
        self,
        input: str,
        tools: Sequence[Tool],
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
    ) -> ToolCallResponse:
        response = await self._acall_llm(
            input,
            message_history=message_history,
            system_instruction=system_instruction,
            tools=tools,
        )
        return self._parse_tool_response(response)

    # subsdiary methods

    def _to_vertexai_function_declaration(self, tool: Tool) -> FunctionDeclaration:
        return FunctionDeclaration(
            name=tool.get_name(),
            description=tool.get_description(),
            parameters=tool.get_parameters(exclude=["additional_properties"]),
        )

    def _get_llm_tools(
        self, tools: Optional[Sequence[Tool]]
    ) -> Optional[list[VertexAITool]]:
        if not tools:
            return None
        return [
            VertexAITool(
                function_declarations=[
                    self._to_vertexai_function_declaration(tool) for tool in tools
                ]
            )
        ]

    def _get_model(
        self,
        system_instruction: Optional[str] = None,
    ) -> GenerativeModel:
        # system_message = [system_instruction] if system_instruction is not None else []
        model = GenerativeModel(
            model_name=self.model_name,
            system_instruction=system_instruction,
        )
        return model

    def get_messages(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
    ) -> list[Content]:
        """Constructs messages for the Vertex AI model from input and message history."""
        messages = []
        if message_history:
            if isinstance(message_history, MessageHistory):
                message_history = message_history.messages
            try:
                MessageList(messages=cast(list[BaseMessage], message_history))
            except ValidationError as e:
                raise LLMGenerationError(e.errors()) from e

            for message in message_history:
                if message.get("role") == "user":
                    messages.append(
                        Content(
                            role="user",
                            parts=[Part.from_text(message.get("content", ""))],
                        )
                    )
                elif message.get("role") == "assistant":
                    messages.append(
                        Content(
                            role="model",
                            parts=[Part.from_text(message.get("content", ""))],
                        )
                    )

        messages.append(Content(role="user", parts=[Part.from_text(input)]))
        return messages

    def get_messages_v2(
        self,
        input: list[LLMMessage],
    ) -> tuple[str | None, list[Content]]:
        """Constructs messages for the Vertex AI model from input only."""
        messages = []
        system_instruction = self.system_instruction
        for message in input:
            role = message.get("role")
            if role == "system":
                system_instruction = message.get("content")
                continue
            if role == "user":
                messages.append(
                    Content(
                        role="user",
                        parts=[Part.from_text(message.get("content", ""))],
                    )
                )
                continue
            if role == "assistant":
                messages.append(
                    Content(
                        role="model",
                        parts=[Part.from_text(message.get("content", ""))],
                    )
                )
                continue
            raise ValueError(f"Unknown role: {role}")
        return system_instruction, messages

    def _get_call_params(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]],
        tools: Optional[Sequence[Tool]],
    ) -> dict[str, Any]:
        options = dict(self.options)
        if tools:
            # we want a tool back, remove generation_config if defined
            options.pop("generation_config", None)
            options["tools"] = self._get_llm_tools(tools)
            if "tool_config" not in options:
                options["tool_config"] = ToolConfig(
                    function_calling_config=ToolConfig.FunctionCallingConfig(
                        mode=ToolConfig.FunctionCallingConfig.Mode.ANY,
                    )
                )
        else:
            # no tools, remove tool_config if defined
            options.pop("tool_config", None)

        messages = self.get_messages(input, message_history)
        options["contents"] = messages
        return options

    def _get_call_params_v2(
        self,
        contents: list[Content],
        tools: Optional[Sequence[Tool]],
        response_format: Optional[Union[Type[BaseModel], dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        from vertexai.generative_models import GenerationConfig

        options = dict(self.options)
        if tools:
            # we want a tool back, remove generation_config if defined
            options.pop("generation_config", None)
            options["tools"] = self._get_llm_tools(tools)
            if "tool_config" not in options:
                options["tool_config"] = ToolConfig(
                    function_calling_config=ToolConfig.FunctionCallingConfig(
                        mode=ToolConfig.FunctionCallingConfig.Mode.ANY,
                    )
                )
        else:
            # no tools, remove tool_config if defined
            options.pop("tool_config", None)

            # Apply response_format and/or kwargs if provided
            if response_format is not None or kwargs:
                # Start with ALL existing params from constructor (including schema)
                existing_config = options.get("generation_config")
                params = _extract_generation_config_params(
                    existing_config, exclude_schema=False
                )

                # If response_format provided, override schema (prioritize it)
                if response_format is not None:
                    # Convert to JSON schema
                    if isinstance(response_format, type) and issubclass(
                        response_format, BaseModel
                    ):
                        # if we migrate to new google-genai-sdk, Pydantic models can be passed directly
                        schema = response_format.model_json_schema()
                    else:
                        schema = response_format
                    params["response_mime_type"] = "application/json"
                    params["response_schema"] = schema

                # Apply kwargs (they override constructor values but preserve schema)
                params.update(kwargs)

                options["generation_config"] = GenerationConfig(**params)
        options["contents"] = contents
        return options

    async def _acall_llm(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
        tools: Optional[Sequence[Tool]] = None,
    ) -> GenerationResponse:
        model = self._get_model(system_instruction=system_instruction)
        options = self._get_call_params(input, message_history, tools)
        response = await model.generate_content_async(**options)
        return response  # type: ignore[no-any-return]

    def _call_llm(
        self,
        input: str,
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        system_instruction: Optional[str] = None,
        tools: Optional[Sequence[Tool]] = None,
    ) -> GenerationResponse:
        model = self._get_model(system_instruction=system_instruction)
        options = self._get_call_params(input, message_history, tools)
        response = model.generate_content(**options)
        return response  # type: ignore[no-any-return]

    def _to_tool_call(self, function_call: FunctionCall) -> ToolCall:
        return ToolCall(
            name=function_call.name,
            arguments=function_call.args,
        )

    def _parse_tool_response(self, response: GenerationResponse) -> ToolCallResponse:
        function_calls = response.candidates[0].function_calls
        return ToolCallResponse(
            tool_calls=[self._to_tool_call(f) for f in function_calls],
            content=None,
        )

    def _parse_content_response(self, response: GenerationResponse) -> LLMResponse:
        return LLMResponse(
            content=response.text,
        )
