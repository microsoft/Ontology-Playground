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
import warnings
from typing import Union, Optional

from pydantic import TypeAdapter

from neo4j_graphrag.message_history import MessageHistory
from neo4j_graphrag.types import LLMMessage


def system_instruction_from_messages(messages: list[LLMMessage]) -> str | None:
    """Extracts the system instruction from a list of LLMMessage, if present."""
    for message in messages:
        if message["role"] == "system":
            return message["content"]
    return None


llm_messages_adapter = TypeAdapter(list[LLMMessage])


def legacy_inputs_to_messages(
    prompt: Union[str, list[LLMMessage], MessageHistory],
    message_history: Optional[Union[list[LLMMessage], MessageHistory]] = None,
    system_instruction: Optional[str] = None,
) -> list[LLMMessage]:
    """Converts legacy prompt and message history inputs to a unified list of LLMMessage."""
    if message_history:
        if isinstance(message_history, MessageHistory):
            messages = message_history.messages
        else:  # list[LLMMessage]
            messages = llm_messages_adapter.validate_python(message_history)
    else:
        messages = []
    if system_instruction is not None:
        if system_instruction_from_messages(messages) is not None:
            warnings.warn(
                "system_instruction provided but ignored as the message history already contains a system message",
                UserWarning,
            )
        else:
            messages.insert(
                0,
                LLMMessage(
                    role="system",
                    content=system_instruction,
                ),
            )

    if isinstance(prompt, str):
        messages.append(LLMMessage(role="user", content=prompt))
        return messages
    if isinstance(prompt, list):
        messages.extend(prompt)
        return messages
    # prompt is a MessageHistory instance
    messages.extend(prompt.messages)
    return messages
