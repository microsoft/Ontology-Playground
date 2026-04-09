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
import logging
import warnings
from typing import Any, List, Optional, Union

# 3rd party dependencies
from pydantic import ValidationError

# project dependencies
from neo4j_graphrag.exceptions import (
    RagInitializationError,
    SearchValidationError,
)
from neo4j_graphrag.generation.prompts import RagTemplate
from neo4j_graphrag.generation.types import RagInitModel, RagResultModel, RagSearchModel
from neo4j_graphrag.llm import LLMInterface, LLMInterfaceV2
from neo4j_graphrag.llm.utils import legacy_inputs_to_messages
from neo4j_graphrag.message_history import MessageHistory
from neo4j_graphrag.retrievers.base import Retriever
from neo4j_graphrag.types import LLMMessage, RetrieverResult
from neo4j_graphrag.utils.logging import prettify

# Set up logger
logger = logging.getLogger(__name__)


# pylint: disable=raise-missing-from
class GraphRAG:
    """Performs a GraphRAG search using a specific retriever
    and LLM.

    Example:

    .. code-block:: python

      import neo4j
      from neo4j_graphrag.retrievers import VectorRetriever
      from neo4j_graphrag.llm.openai_llm import OpenAILLM
      from neo4j_graphrag.generation import GraphRAG

      driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

      retriever = VectorRetriever(driver, "vector-index-name", custom_embedder)
      llm = OpenAILLM()
      graph_rag = GraphRAG(retriever, llm)
      graph_rag.search(query_text="Find me a book about Fremen")

    Args:
        retriever (Retriever): The retriever used to find relevant context to pass to the LLM.
        llm (LLMInterface, LLMInterfaceV2 or LangChain Chat Model): The LLM used to generate
            the answer.
        prompt_template (RagTemplate): The prompt template that will be formatted with context and
            user question and passed to the LLM.

    Raises:
        RagInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        retriever: Retriever,
        llm: Union[LLMInterface, LLMInterfaceV2, Any],
        prompt_template: RagTemplate = RagTemplate(),
    ):
        try:
            validated_data = RagInitModel(
                retriever=retriever,
                llm=llm,
                prompt_template=prompt_template,
            )
        except ValidationError as e:
            raise RagInitializationError(e.errors())
        self.retriever = validated_data.retriever
        self.llm = validated_data.llm
        self.prompt_template = validated_data.prompt_template

    def search(
        self,
        query_text: str = "",
        message_history: Optional[Union[List[LLMMessage], MessageHistory]] = None,
        examples: str = "",
        retriever_config: Optional[dict[str, Any]] = None,
        return_context: Optional[bool] = None,
        response_fallback: Optional[str] = None,
    ) -> RagResultModel:
        """
        .. warning::
            The default value of 'return_context' will change from 'False'
                to 'True' in a future version.


        This method performs a full RAG search:
            1. Retrieval: context retrieval
            2. Augmentation: prompt formatting
            3. Generation: answer generation with LLM


        Args:
            query_text (str): The user question.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]]): A collection
                of previous messages, with each message having a specific role assigned.
            examples (str): Examples added to the LLM prompt.
            retriever_config (Optional[dict]): Parameters passed to the retriever.
                search method; e.g.: top_k
            return_context (bool): Whether to append the retriever result to the final result
                (default: False).
            response_fallback (Optional[str]): If not null, will return this message instead
                of calling the LLM if context comes back empty.

        Returns:
            RagResultModel: The LLM-generated answer.

        """
        if return_context is None:
            warnings.warn(
                "The default value of 'return_context' will change from 'False'"
                " to 'True' in a future version.",
                DeprecationWarning,
            )
            return_context = False

        try:
            validated_data = RagSearchModel(
                query_text=query_text,
                examples=examples,
                retriever_config=retriever_config or {},
                return_context=return_context,
                response_fallback=response_fallback,
            )
        except ValidationError as e:
            raise SearchValidationError(e.errors())
        if isinstance(message_history, MessageHistory):
            message_history = message_history.messages
        query = self._build_query(validated_data.query_text, message_history)
        retriever_result: RetrieverResult = self.retriever.search(
            query_text=query, **validated_data.retriever_config
        )
        if len(retriever_result.items) == 0 and response_fallback is not None:
            answer = response_fallback
        else:
            context = "\n".join(item.content for item in retriever_result.items)
            prompt = self.prompt_template.format(
                query_text=query_text, context=context, examples=validated_data.examples
            )

            logger.debug("RAG: retriever_result=%s", prettify(retriever_result))
            logger.debug("RAG: prompt=%s", prompt)

            if self.is_langchain_compatible():
                # llm interface v2 or langchain chat model
                messages = legacy_inputs_to_messages(
                    prompt=prompt,
                    message_history=message_history,
                    system_instruction=self.prompt_template.system_instructions,
                )

                # langchain chat model compatible invoke
                llm_response = self.llm.invoke(
                    input=messages,
                )
            elif isinstance(self.llm, LLMInterface):
                # may have custom LLMs inherited from V1, keep it for backward compatibility
                llm_response = self.llm.invoke(
                    input=prompt,
                    message_history=message_history,
                    system_instruction=self.prompt_template.system_instructions,
                )
            else:
                raise ValueError(f"Type {type(self.llm)} of LLM is not supported.")
            answer = llm_response.content
        result: dict[str, Any] = {"answer": answer}
        if return_context:
            result["retriever_result"] = retriever_result
        return RagResultModel(**result)

    def _build_query(
        self,
        query_text: str,
        message_history: Optional[List[LLMMessage]] = None,
    ) -> str:
        """Builds the final query text, incorporating message history if provided."""
        summary_system_message = (
            "You are a summarization assistant. "
            "Summarize the given text in no more than 300 words."
        )
        if message_history:
            summarization_prompt = self._chat_summary_prompt(
                message_history=message_history
            )
            if self.is_langchain_compatible():
                messages = legacy_inputs_to_messages(
                    summarization_prompt,
                    system_instruction=summary_system_message,
                )
                summary = self.llm.invoke(
                    input=messages,
                ).content
            elif isinstance(self.llm, LLMInterface):
                summary = self.llm.invoke(
                    input=summarization_prompt,
                    system_instruction=summary_system_message,
                ).content
            else:
                raise ValueError(f"Type {type(self.llm)} of LLM is not supported.")

            return self.conversation_prompt(summary=summary, current_query=query_text)
        return query_text

    def is_langchain_compatible(self) -> bool:
        """Checks if the LLM is compatible with LangChain."""
        if isinstance(self.llm, LLMInterfaceV2):
            return True

        try:
            # langchain-core is an optional dependency
            from langchain_core.language_models import BaseChatModel

            return isinstance(self.llm, BaseChatModel)
        except ImportError:
            return False

    def _chat_summary_prompt(self, message_history: List[LLMMessage]) -> str:
        message_list = [
            f"{message['role']}: {message['content']}" for message in message_history
        ]
        history = "\n".join(message_list)
        return f"""
Summarize the message history:

{history}
"""

    def conversation_prompt(self, summary: str, current_query: str) -> str:
        return f"""
Message Summary:
{summary}

Current Query:
{current_query}
"""
