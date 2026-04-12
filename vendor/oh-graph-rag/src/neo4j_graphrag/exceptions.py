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

from pydantic_core import ErrorDetails


class Neo4jGraphRagError(Exception):
    """Global exception used for the neo4j-graphrag package."""

    pass


class RetrieverInitializationError(Neo4jGraphRagError):
    """Exception raised when initialization of a retriever fails."""

    def __init__(self, errors: list[ErrorDetails]) -> None:
        super().__init__(f"Initialization failed: {errors}")
        self.errors = errors


class RagInitializationError(Neo4jGraphRagError):
    def __init__(self, errors: list[ErrorDetails]):
        super().__init__(f"Initialization failed: {errors}")
        self.errors = errors


class PromptMissingInputError(Neo4jGraphRagError):
    """Exception raised when a prompt required input is missing."""

    pass


class LLMGenerationError(Neo4jGraphRagError):
    """Exception raised when answer generation from LLM fails."""

    pass


class EmbeddingsGenerationError(Neo4jGraphRagError):
    """Exception raised when generation of embeddings fails"""


class SearchValidationError(Neo4jGraphRagError):
    """Exception raised for validation errors during search."""

    def __init__(self, errors: list[ErrorDetails]) -> None:
        super().__init__(f"Search validation failed: {errors}")
        self.errors = errors


class FilterValidationError(Neo4jGraphRagError):
    """Exception raised when input validation for metadata filtering fails."""

    pass


class EmbeddingRequiredError(Neo4jGraphRagError):
    """Exception raised when an embedding method is required but not provided."""

    pass


class InvalidRetrieverResultError(Neo4jGraphRagError):
    """Exception raised when the Retriever fails to return a result."""

    pass


class Neo4jIndexError(Neo4jGraphRagError):
    """Exception raised when handling Neo4j index fails."""

    pass


class Neo4jInsertionError(Neo4jGraphRagError):
    """Exception raised when inserting data into the Neo4j database fails."""

    pass


class Neo4jVersionError(Neo4jGraphRagError):
    """Exception raised when Neo4j version does not meet minimum requirements."""

    def __init__(self) -> None:
        super().__init__("This package only supports Neo4j version 5.18.1 or greater")


class Text2CypherRetrievalError(Neo4jGraphRagError):
    """Exception raised when text-to-cypher retrieval fails."""

    pass


class SchemaFetchError(Neo4jGraphRagError):
    """Exception raised when a Neo4jSchema cannot be fetched."""

    pass


class SchemaValidationError(Neo4jGraphRagError):
    """Custom exception for errors in schema configuration."""

    pass


class SchemaExtractionError(Neo4jGraphRagError):
    """Exception raised for errors in automatic schema extraction."""

    pass


class PdfLoaderError(Neo4jGraphRagError):
    """Custom exception for errors in PDF loader."""

    pass


class PromptMissingPlaceholderError(Neo4jGraphRagError):
    """Exception raised when a prompt is missing an expected placeholder."""


class InvalidHybridSearchRankerError(Neo4jGraphRagError):
    """Exception raised when an invalid ranker type for Hybrid Search is provided."""


class SearchQueryParseError(Neo4jGraphRagError):
    """Exception raised when there is a query parse error in the text search string."""


class RetryableError(LLMGenerationError):
    """Exception raised for transient errors that may succeed on retry (e.g. rate limits)."""

    pass


class RateLimitError(RetryableError):
    """Exception raised when API rate limit is exceeded."""
