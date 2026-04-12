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
import re
from typing import Any, Callable, Dict, Optional

import neo4j
from neo4j.exceptions import CypherSyntaxError, DriverError, Neo4jError
from pydantic import ValidationError

from neo4j_graphrag.exceptions import (
    RetrieverInitializationError,
    SchemaFetchError,
    SearchValidationError,
    Text2CypherRetrievalError,
)
from neo4j_graphrag.generation.prompts import Text2CypherTemplate
from neo4j_graphrag.llm import LLMInterface
from neo4j_graphrag.retrievers.base import Retriever
from neo4j_graphrag.schema import get_schema
from neo4j_graphrag.types import (
    LLMModel,
    Neo4jDriverModel,
    Neo4jSchemaModel,
    RawSearchResult,
    RetrieverResultItem,
    Text2CypherRetrieverModel,
    Text2CypherSearchModel,
)

logger = logging.getLogger(__name__)


def extract_cypher(text: str) -> str:
    """Extract and format Cypher query from text, handling code blocks and special characters.

    This function performs two main operations:
    1. Extracts Cypher code from within triple backticks (```), if present
    2. Automatically adds backtick quotes around multi-word identifiers:
       - Node labels (e.g., ":Data Science" becomes ":`Data Science`")
       - Property keys (e.g., "first name:" becomes "`first name`:")
       - Relationship types (e.g., "[:WORKS WITH]" becomes "[:`WORKS WITH`]")

    Args:
        text (str): Raw text that may contain Cypher code, either within triple
                   backticks or as plain text.

    Returns:
        str: Properly formatted Cypher query with correct backtick quoting.
    """
    # Extract Cypher code enclosed in triple backticks
    pattern = r"```(.*?)```"
    matches = re.findall(pattern, text, re.DOTALL)
    cypher_query = matches[0] if matches else text
    # Quote node labels in backticks if they contain spaces and are not already quoted
    cypher_query = re.sub(
        r":\s*(?!`\s*)(\s*)([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)+)(?!\s*`)(\s*)",
        r":`\2`",
        cypher_query,
    )
    # Quote property keys in backticks if they contain spaces and are not already quoted
    cypher_query = re.sub(
        r"([,{]\s*)(?!`)([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)+)(?!`)(\s*:)",
        r"\1`\2`\3",
        cypher_query,
    )
    # Quote relationship types in backticks if they contain spaces and are not already quoted
    cypher_query = re.sub(
        r"(\[\s*[a-zA-Z0-9_]*\s*:\s*)(?!`)([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)+)(?!`)(\s*(?:\]|-))",
        r"\1`\2`\3",
        cypher_query,
    )
    return cypher_query


class Text2CypherRetriever(Retriever):
    """
    Allows for the retrieval of records from a Neo4j database using natural language.
    Converts a user's natural language query to a Cypher query using an LLM,
    then retrieves records from a Neo4j database using the generated Cypher query.

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        llm (neo4j_graphrag.generation.llm.LLMInterface): LLM object to generate the Cypher query.
        neo4j_schema (Optional[str]): Neo4j schema used to generate the Cypher query.
        examples (Optional[list[str], optional): Optional user input/query pairs for the LLM to use as examples.
        custom_prompt (Optional[str]): Optional custom prompt to use instead of auto generated prompt. Will include the neo4j_schema for schema and examples for examples prompt parameters, if they are provided.

    Raises:
        RetrieverInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        llm: LLMInterface,
        neo4j_schema: Optional[str] = None,
        examples: Optional[list[str]] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        custom_prompt: Optional[str] = None,
        neo4j_database: Optional[str] = None,
    ) -> None:
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            llm_model = LLMModel(llm=llm)
            neo4j_schema_model = (
                Neo4jSchemaModel(neo4j_schema=neo4j_schema) if neo4j_schema else None
            )
            validated_data = Text2CypherRetrieverModel(
                driver_model=driver_model,
                llm_model=llm_model,
                neo4j_schema_model=neo4j_schema_model,
                examples=examples,
                result_formatter=result_formatter,
                custom_prompt=custom_prompt,
                neo4j_database=neo4j_database,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            validated_data.driver_model.driver, validated_data.neo4j_database
        )
        self.llm = validated_data.llm_model.llm
        self.examples = validated_data.examples
        self.result_formatter = validated_data.result_formatter
        self.custom_prompt = validated_data.custom_prompt
        if validated_data.custom_prompt:
            if (
                validated_data.neo4j_schema_model
                and validated_data.neo4j_schema_model.neo4j_schema
            ):
                neo4j_schema = validated_data.neo4j_schema_model.neo4j_schema
            else:
                neo4j_schema = ""
        else:
            if (
                validated_data.neo4j_schema_model
                and validated_data.neo4j_schema_model.neo4j_schema
            ):
                neo4j_schema = validated_data.neo4j_schema_model.neo4j_schema
            else:
                try:
                    neo4j_schema = get_schema(validated_data.driver_model.driver)
                except (Neo4jError, DriverError) as e:
                    error_message = getattr(e, "message", str(e))
                    raise SchemaFetchError(
                        f"Failed to fetch schema for Text2CypherRetriever: {error_message}"
                    ) from e
        self.neo4j_schema = neo4j_schema

    def get_search_results(
        self, query_text: str, prompt_params: Optional[Dict[str, Any]] = None
    ) -> RawSearchResult:
        """Converts query_text to a Cypher query using an LLM.
           Retrieve records from a Neo4j database using the generated Cypher query.

        Args:
            query_text (str): The natural language query used to search the Neo4j database.
            prompt_params (Dict[str, Any]): additional values to inject into the custom prompt, if it is provided. If the schema or examples parameter is specified, it will overwrite the corresponding value passed during initialization. Example: {'schema': 'this is the graph schema'}

        Raises:
            SearchValidationError: If validation of the input arguments fail.
            Text2CypherRetrievalError: If the LLM fails to generate a correct Cypher query.

        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """
        try:
            validated_data = Text2CypherSearchModel(query_text=query_text)
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        prompt_template = Text2CypherTemplate(template=self.custom_prompt)

        if prompt_params is not None:
            # parse the schema and examples inputs
            examples_to_use = prompt_params.pop("examples", None) or (
                "\n".join(self.examples) if self.examples else ""
            )
            schema_to_use = prompt_params.pop("schema", None) or self.neo4j_schema
        else:
            examples_to_use = "\n".join(self.examples) if self.examples else ""
            schema_to_use = self.neo4j_schema
            prompt_params = dict()

        prompt = prompt_template.format(
            schema=schema_to_use,
            examples=examples_to_use,
            query_text=validated_data.query_text,
            **prompt_params,
        )

        logger.debug("Text2CypherRetriever prompt: %s", prompt)

        try:
            llm_result = self.llm.invoke(prompt)
            t2c_query = extract_cypher(llm_result.content)
            logger.debug("Text2CypherRetriever Cypher query: %s", t2c_query)
            records, _, _ = self.driver.execute_query(
                query_=t2c_query,
                database_=self.neo4j_database,
                routing_=neo4j.RoutingControl.READ,
            )
        except CypherSyntaxError as e:
            raise Text2CypherRetrievalError(
                f"Failed to get search result: {e.message}"
            ) from e

        return RawSearchResult(
            records=records,
            metadata={
                "cypher": t2c_query,
            },
        )
