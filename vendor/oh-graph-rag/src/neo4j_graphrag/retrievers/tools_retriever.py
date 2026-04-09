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

from typing import Any, List, Optional, Sequence

import neo4j

from neo4j_graphrag.llm.base import LLMInterface
from neo4j_graphrag.retrievers.base import Retriever
from neo4j_graphrag.types import RawSearchResult
from neo4j_graphrag.tool import Tool
from neo4j_graphrag.types import LLMMessage


class ToolsRetriever(Retriever):
    """A retriever that uses an LLM to select appropriate tools for retrieval based on user input.

    This retriever takes an LLM instance and a list of Tool objects as input. When a search is performed,
    it uses the LLM to analyze the query and determine which tools (if any) should be used to retrieve
    the necessary data. It then executes the selected tools and returns the combined results.

    Example:

    .. code-block:: python

        import neo4j
        from neo4j_graphrag.retrievers import ToolsRetriever, VectorRetriever, Text2CypherRetriever
        from neo4j_graphrag.llm import OpenAILLM
        from neo4j_graphrag.embeddings import OpenAIEmbeddings

        driver = neo4j.GraphDatabase.driver("neo4j://localhost:7687", auth=("neo4j", "password"))
        llm = OpenAILLM(model_name="gpt-5", api_key="your-api-key")
        embedder = OpenAIEmbeddings(model="text-embedding-3-small", api_key="your-api-key")

        # Create retrievers and convert them to tools
        vector_retriever = VectorRetriever(driver, "vector-index", embedder)
        vector_tool = vector_retriever.convert_to_tool(
            name="vector_search",
            description="Search for documents using semantic similarity"
        )

        text2cypher_retriever = Text2CypherRetriever(driver, llm)
        cypher_tool = text2cypher_retriever.convert_to_tool(
            name="cypher_search",
            description="Generate and execute Cypher queries for structured data retrieval"
        )

        # Initialize ToolsRetriever with the tools
        tools_retriever = ToolsRetriever(
            driver=driver,
            llm=llm,
            tools=[vector_tool, cypher_tool]
        )

        # Use the retriever - the LLM will automatically select appropriate tools
        result = tools_retriever.search("What movies did Tom Hanks act in and what are their plots?")

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        llm (LLMInterface): LLM instance used to select and coordinate tool execution.
        tools (Sequence[Tool]): List of tools available for selection. All tools must have unique names.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default).
        system_instruction (Optional[str]): Custom system instruction for the LLM to guide tool selection. If not provided, a default instruction is used.

    Raises:
        ValueError: If duplicate tool names are found in the tools list.
    """

    # Disable Neo4j version verification since this retriever doesn't directly interact with Neo4j
    VERIFY_NEO4J_VERSION = False

    def __init__(
        self,
        driver: neo4j.Driver,
        llm: LLMInterface,
        tools: Sequence[Tool],
        neo4j_database: Optional[str] = None,
        system_instruction: Optional[str] = None,
    ):
        """Initialize the ToolsRetriever with an LLM and a list of tools."""
        super().__init__(driver, neo4j_database)
        self.llm = llm
        self._tools = list(tools)  # Make a copy to allow modification
        self._validate_tool_names()
        self.system_instruction = (
            system_instruction or self._get_default_system_instruction()
        )

    def _validate_tool_names(self) -> None:
        """Validate that all tool names are unique."""
        tool_names = [tool.get_name() for tool in self._tools]
        duplicate_names = [
            name for name in set(tool_names) if tool_names.count(name) > 1
        ]

        if duplicate_names:
            raise ValueError(
                f"Duplicate tool names found: {duplicate_names}. "
                "All tools must have unique names for proper LLM tool selection."
            )

    def _get_default_system_instruction(self) -> str:
        """Get the default system instruction for the LLM."""
        return (
            "You are an assistant that helps select the most appropriate tools to retrieve information "
            "based on the user's query. Analyze the query carefully and determine which tools, if any, "
            "would be most helpful in retrieving the relevant information. You can select multiple tools "
            "if necessary, or none if no tools are appropriate for the query."
        )

    def get_search_results(
        self,
        query_text: str,
        message_history: Optional[List[LLMMessage]] = None,
        **kwargs: Any,
    ) -> RawSearchResult:
        """Use the LLM to select and execute appropriate tools based on the query.

        Args:
            query_text (str): The user's query text.
            message_history (Optional[Union[List[LLMMessage], MessageHistory]], optional):
                Previous conversation history. Defaults to None.
            **kwargs (Any): Additional arguments passed to the tool execution.

        Returns:
            RawSearchResult: The combined results from the executed tools.
        """
        if not self._tools:
            # No tools available, return empty result
            return RawSearchResult(
                records=[],
                metadata={"query": query_text, "error": "No tools available"},
            )

        try:
            # Use the LLM to select appropriate tools
            tool_call_response = self.llm.invoke_with_tools(
                input=query_text,
                tools=self._tools,
                message_history=message_history,
                system_instruction=self.system_instruction,
            )
            # If no tool calls were made, return empty result
            if not tool_call_response.tool_calls:
                return RawSearchResult(
                    records=[],
                    metadata={
                        "query": query_text,
                        "llm_response": tool_call_response.content,
                        "tools_selected": [],
                    },
                )

            # Execute each selected tool and collect results
            all_records = []
            tools_selected = []

            for tool_call in tool_call_response.tool_calls:
                tool_name = tool_call.name
                tools_selected.append(tool_name)

                # Find the tool by name
                selected_tool = next(
                    (tool for tool in self._tools if tool.get_name() == tool_name), None
                )
                if selected_tool is not None:
                    # Extract arguments from the tool call
                    tool_args = tool_call.arguments or {}

                    # Execute the tool with the provided arguments
                    tool_result = selected_tool.execute(**tool_args)

                    # Handle different tool result types
                    if hasattr(tool_result, "items") and not callable(
                        getattr(tool_result, "items")
                    ):
                        # RetrieverResult from formatted retriever tools
                        for item in tool_result.items:
                            record = neo4j.Record(
                                {
                                    "content": item.content,
                                    "tool_name": tool_name,
                                    "metadata": {
                                        **(item.metadata or {}),
                                        "tool": tool_name,
                                    },
                                }
                            )
                            all_records.append(record)
                    elif hasattr(tool_result, "records"):
                        # RawSearchResult from raw retriever tools (legacy)
                        for record in tool_result.records:
                            # Wrap raw records with tool attribution
                            attributed_record = neo4j.Record(
                                {
                                    "content": str(record),
                                    "tool_name": tool_name,
                                    "metadata": {
                                        "original_record": dict(record),
                                        "tool": tool_name,
                                    },
                                }
                            )
                            all_records.append(attributed_record)
                    else:
                        # Handle non-retriever tools or simple return values
                        record = neo4j.Record(
                            {
                                "content": str(tool_result),
                                "tool_name": tool_name,
                                "metadata": {"tool": tool_name},
                            }
                        )
                        all_records.append(record)

            # Combine metadata from all tool calls
            combined_metadata = {
                "query": query_text,
                "llm_response": tool_call_response.content,
                "tools_selected": tools_selected,
            }

            return RawSearchResult(records=all_records, metadata=combined_metadata)

        except Exception as e:
            # Handle any errors during tool selection or execution
            return RawSearchResult(
                records=[],
                metadata={
                    "query": query_text,
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )
