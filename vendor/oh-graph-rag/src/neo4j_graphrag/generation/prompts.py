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
from typing import Any, Optional

from neo4j_graphrag.exceptions import (
    PromptMissingInputError,
    PromptMissingPlaceholderError,
)


class PromptTemplate:
    """This class is used to generate a parameterized prompt. It is defined
    from a string (the template) using the Python format syntax (parameters
    between curly braces `{}`) and a list of required inputs.
    Before sending the instructions to an LLM, call the `format` method that will
    replace parameters with the provided values. If any of the expected inputs is
    missing, a `PromptMissingInputError` is raised.
    """

    DEFAULT_SYSTEM_INSTRUCTIONS: str = ""
    DEFAULT_TEMPLATE: str = ""
    EXPECTED_INPUTS: list[str] = list()

    def __init__(
        self,
        template: Optional[str] = None,
        expected_inputs: Optional[list[str]] = None,
        system_instructions: Optional[str] = None,
    ) -> None:
        self.template = template or self.DEFAULT_TEMPLATE
        self.expected_inputs = expected_inputs or self.EXPECTED_INPUTS
        self.system_instructions = (
            system_instructions or self.DEFAULT_SYSTEM_INSTRUCTIONS
        )

        for e in self.expected_inputs:
            if f"{{{e}}}" not in self.template:
                raise PromptMissingPlaceholderError(
                    f"`template` is missing placeholder {e}"
                )

    def _format(self, **kwargs: Any) -> str:
        for e in self.EXPECTED_INPUTS:
            if e not in kwargs:
                raise PromptMissingInputError(f"Missing input '{e}'")
        return self.template.format(**kwargs)

    def format(self, *args: Any, **kwargs: Any) -> str:
        """This method is used to replace parameters with the provided values.
        Parameters must be provided:
        - as kwargs
        - as args if using the same order as in the expected inputs

        Example:

        .. code-block:: python

            prompt_template = PromptTemplate(
                template='''Explain the following concept to {target_audience}:
                Concept: {concept}
                Answer:
                ''',
                expected_inputs=['target_audience', 'concept']
            )
            prompt = prompt_template.format('12 yo children', concept='graph database')
            print(prompt)

            # Result:
            # '''Explain the following concept to 12 yo children:
            # Concept: graph database
            # Answer:
            # '''

        """
        data = kwargs
        data.update({k: v for k, v in zip(self.expected_inputs, args)})
        return self._format(**data)


class RagTemplate(PromptTemplate):
    DEFAULT_SYSTEM_INSTRUCTIONS = "Answer the user question using the provided context."
    DEFAULT_TEMPLATE = """Context:
{context}

Examples:
{examples}

Question:
{query_text}

Answer:
"""
    EXPECTED_INPUTS = ["context", "query_text", "examples"]

    def format(self, query_text: str, context: str, examples: str) -> str:
        return super().format(query_text=query_text, context=context, examples=examples)


class Text2CypherTemplate(PromptTemplate):
    DEFAULT_TEMPLATE = """
Task: Generate a Cypher statement for querying a Neo4j graph database from a user input.

Schema:
{schema}

Examples (optional):
{examples}

Input:
{query_text}

Do not use any properties or relationships not included in the schema.
Do not include triple backticks ``` or any additional text except the generated Cypher statement in your response.

Cypher query:
"""
    EXPECTED_INPUTS = ["query_text"]

    def format(
        self,
        schema: Optional[str] = None,
        examples: Optional[str] = None,
        query_text: str = "",
        query: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        if query is not None:
            if query_text:
                warnings.warn(
                    "Both 'query' and 'query_text' are provided, 'query_text' will be used.",
                    DeprecationWarning,
                    stacklevel=2,
                )
            elif isinstance(query, str):
                warnings.warn(
                    "'query' is deprecated and will be removed in a future version, please use 'query_text' instead.",
                    DeprecationWarning,
                    stacklevel=2,
                )
                query_text = query

        return super().format(
            query_text=query_text, schema=schema, examples=examples, **kwargs
        )


class ERExtractionTemplate(PromptTemplate):
    DEFAULT_TEMPLATE = """
You are a top-tier algorithm designed for extracting
information in structured formats to build a knowledge graph.

Extract the entities (nodes) and specify their type from the following text.
Also extract the relationships between these nodes.

Return result as JSON using the following format:
{{"nodes": [ {{"id": "0", "label": "Person", "properties": {{"name": "John"}} }}],
"relationships": [{{"type": "KNOWS", "start_node_id": "0", "end_node_id": "1", "properties": {{"since": "2024-08-01"}} }}] }}

Use only the following node and relationship types (if provided):
{schema}

Assign a unique ID (string) to each node, and reuse it to define relationships.
Do respect the source and target node types for relationship and
the relationship direction.

Make sure you adhere to the following rules to produce valid JSON objects:
- Do not return any additional information other than the JSON in it.
- Omit any backticks around the JSON - simply output the JSON on its own.
- The JSON object must not wrapped into a list - it is its own JSON object.
- Property names must be enclosed in double quotes

Examples:
{examples}

Input text:

{text}
"""
    EXPECTED_INPUTS = ["text"]

    def format(
        self,
        schema: dict[str, Any],
        examples: str,
        text: str = "",
    ) -> str:
        return super().format(text=text, schema=schema, examples=examples)


class SchemaExtractionTemplate(PromptTemplate):
    DEFAULT_TEMPLATE = """
You are a top-tier algorithm designed for extracting a labeled property graph schema in
structured formats.

Generate a generalized graph schema based on the input text. Identify key node types,
their relationship types, and property types.

IMPORTANT RULES:
1. Return only abstract schema information, not concrete instances.
2. Use singular PascalCase labels for node types (e.g., Person, Company, Product).
3. Use UPPER_SNAKE_CASE labels for relationship types (e.g., WORKS_FOR, MANAGES).
4. Include property definitions only when the type can be confidently inferred, otherwise omit them.
5. When defining patterns, ensure that every node label and relationship label mentioned exists in your lists of node types and relationship types.
6. Do not create node types that aren't clearly mentioned in the text.
7. Keep your schema minimal and focused on clearly identifiable patterns in the text.
8. UNIQUENESS CONSTRAINTS:
8.1 UNIQUENESS is optional; each node_type may or may not have exactly one uniqueness constraint.
8.2 Only use properties that seem to not have too many missing values in the sample.
8.3 Constraints reference node_types by label and specify which property is unique.
8.4 If a property appears in a uniqueness constraint it MUST also appear in the corresponding node_type as a property.
9. REQUIRED PROPERTIES:
9.1 Mark a property as "required": true if every instance of that node/relationship type MUST have this property (non-nullable).
9.2 Mark a property as "required": false if the property is optional and may be absent on some instances.
9.3 Properties that are identifiers, names, or essential characteristics are typically required.
9.4 Properties that are supplementary information (phone numbers, descriptions, metadata) are typically optional.
9.5 When uncertain, default to "required": false.
9.6 If a property has a UNIQUENESS constraint, it MUST be marked as "required": true.

Accepted property types are: BOOLEAN, DATE, DURATION, FLOAT, INTEGER, LIST,
LOCAL_DATETIME, LOCAL_TIME, POINT, STRING, ZONED_DATETIME, ZONED_TIME.

Return a valid JSON object that follows this precise structure:
{{
  "node_types": [
    {{
      "label": "Person",
      "properties": [
        {{
          "name": "name",
          "type": "STRING",
          "required": true
        }},
        {{
          "name": "email",
          "type": "STRING",
          "required": false
        }}
      ]
    }}
    ...
  ],
  "relationship_types": [
    {{
      "label": "WORKS_FOR"
    }}
    ...
  ],
  "patterns": [
    {{"source": "Person", "relationship": "WORKS_FOR", "target": "Company"}},
    ...
  ],
  "constraints": [
    {{
      "type": "UNIQUENESS",
      "node_type": "Person",
      "property_name": "name"
    }}
    ...
  ]
}}

Examples:
{examples}

Input text:
{text}
"""
    EXPECTED_INPUTS = ["text"]

    def format(
        self,
        text: str = "",
        examples: str = "",
    ) -> str:
        return super().format(text=text, examples=examples)
