# @neo4j/neo4j-graphrag-python

## Next

### Changed

- Updated examples, default values, and documentation to use `gpt-4.1` / `gpt-4.1-mini` instead of deprecated GPT-4* models (e.g. `gpt-4o`, `gpt-4`).
- **Breaking**: `SimpleKGPipeline` now automatically enables structured output when the `LLMInterface` supports structured output (so far, `OpenAILLM`, `VertexAILLM`). This takes precedence over any `response_format` configured in `model_params` (e.g., `{"type": "json_object"}`), which will be ignored.

## 1.13.1

- Fixed invalid lexical graph relationships causing "Relationship references unknown start node" errors during parquet import when nodes are pruned.
- Make rate limit handler open to which exceptions it can retry on
- Fix the initialization of the vertexai LLM class

## 1.13.0

### Added

- Support for structured output in `OpenAILLM` and `VertexAILLM` via `response_format` parameter. Accepts Pydantic models (requires `ConfigDict(extra="forbid")`) or JSON schemas.
- Added `use_structured_output` parameter to `LLMEntityRelationExtractor` for improved entity extraction reliability with OpenAI/VertexAI LLMs.
- Added `use_structured_output` parameter to `SchemaFromTextExtractor` for improved schema generation with OpenAI/VertexAI LLMs. Enforces `GraphSchema` structure via Pydantic model validation and includes automatic cleanup of invalid patterns/constraints.
- Added `supports_structured_output` capability flag to `LLMInterface` for forward-compatible detection of structured output support across LLM implementations.
- Support for async embeddings in the `Embedder` base class and implementation for `OllamaEmbedding`.

### Changed

- **Breaking**: made `Neo4jNode`, `Neo4jRelationship`, and `Neo4jGraph` stricter: properties field now uses typed `PropertyValue` (Neo4j primitives, temporal values, lists, `GeoPoint`).
- **Breaking**: `NodeType.properties` now requires at least one property (`min_length=1`). String-based node definitions (e.g., `NodeType("Person")`) automatically receive a default "name" property with `additional_properties=True`.
- **Breaking**: `RelationshipType` with empty properties and `additional_properties=False` is now auto-corrected to `additional_properties=True` to prevent pruning of LLM-extracted properties.
- Introduced `Pattern` Pydantic model for internal storage of graph patterns, replacing tuple format. Public APIs maintain backward compatibility by accepting both tuples and `Pattern` objects.


## 1.12.0

## Added

- Support for Python 3.14
- Support for version 6.0.0 of the Neo4j Python driver

### Changed

- Switched project/dependency management from Poetry to uv.
- Dropped support for Python 3.9 (EOL)


## 1.11.0

### Added

- Added an optional `node_label_neo4j` parameter in the external retrievers to speed up the search query in Neo4j.
- Exposed optional `sample` parameter on `get_schema` and `get_structured_schema` to control APOC sampling for schema discovery.
- Added an optional `id_property_getter` callable parameter in the Qdrant retriever to allow for custom ID retrieval.

## 1.10.1

### Added

- Added automatic rate limiting with retry logic and exponential backoff for all Embedding providers using tenacity. The `RateLimitHandler` interface allows for custom rate limiting strategies, including the ability to disable rate limiting entirely.
- JSON response returned to `SchemaFromTextExtractor` is cleansed of any markdown code blocks before being loaded.
- Tool calling support for OllamaLLM.

## 1.10.0

### Added

- Added a `ToolsRetriever` retriever that uses an LLM to decide on what tools to use to find the relevant data.
- Added `convert_to_tool` method to the `Retriever` interface to convert a Retriever to a Tool so it can be used within the ToolsRetriever. This is useful when you might want to have both a VectorRetriever and a Text2CypherRetreiver as a fallback.
- Added `schema_visualization` function to visualize a graph schema using neo4j-viz.

### Fixed

- Fixed an edge case where the LLM can output a property with type 'map', which was causing errors during import as it is not a valid property type in Neo4j.


### Added

- Document node is now always created when running SimpleKGPipeline, even if `from_pdf=False`.
- Document metadata is exposed in SimpleKGPipeline run method.


## 1.9.1

### Fixed

- Fixed documentation for PdfLoader
- Fixed a bug where the `format` argument for `OllamaLLM` was not propagated to the client.
- Fixed `AttributeError` in `SchemaFromTextExtractor` when filtering out node/relationship types with no labels.
- Fixed an import error in `VertexAIEmbeddings`.

## 1.9.0

### Fixed

- Fixed a bug where Session nodes were duplicated.

## Added

- Added automatic rate limiting with retry logic and exponential backoff for all LLM providers using tenacity. The `RateLimitHandler` interface allows for custom rate limiting strategies, including the ability to disable rate limiting entirely.

## 1.8.0

### Added

- Support for Python 3.13
- Added support for automatic schema extraction from text using LLMs. In the `SimpleKGPipeline`, when the user provides no schema, the automatic schema extraction is enabled by default.
- Added ability to return a user-defined message if context is empty in GraphRAG (which skips the LLM call).

### Fixed

- Fixed a bug where `spacy` and `rapidfuzz` needed to be installed even if not using the relevant entity resolvers.
- Fixed a bug where `VertexAILLM.(a)invoke_with_tools` called with multiple tools would raise an error.

### Changed

#### Strict mode

- Strict mode in `SimpleKGPipeline`: the `enforce_schema` option is removed and replaced by a schema-driven pruning.

#### Schema definition

- The `SchemaEntity` model has been renamed `NodeType`.
- The `SchemaRelation` model has been renamed `RelationshipType`.
- The `SchemaProperty` model has been renamed `PropertyType`.
- `SchemaConfig` has been removed in favor of `GraphSchema` (used in the `SchemaBuilder` and `EntityRelationExtractor` classes). `entities`, `relations` and `potential_schema` fields have also been renamed `node_types`, `relationship_types` and `patterns` respectively.

#### Other

- The reserved `id` property on `__KGBuilder__` nodes is removed.
- The `chunk_index` property on `__Entity__` nodes is removed. Use the `FROM_CHUNK` relationship instead.
- The `__entity__id` index is not used anymore and can be dropped from the database (it has been replaced by `__entity__tmp_internal_id`).


## 1.7.0

### Added

- Added tool calling functionality to the LLM base class with OpenAI and VertexAI implementations, enabling structured parameter extraction and function calling.
- Added support for multi-vector collection in Qdrant driver.
- Added a `Pipeline.stream` method to stream pipeline progress.
- Added a new semantic match resolver to the KG Builder for entity resolution based on spaCy embeddings and cosine similarities so that nodes with similar textual properties get merged.
- Added a new fuzzy match resolver to the KG Builder for entity resolution based on RapiFuzz string fuzzy matching.

### Changed

- Improved log output readability in Retrievers and GraphRAG and added embedded vector to retriever result metadata for debugging.
- Switched from pygraphviz to neo4j-viz
    -   Renders interactive graph now on HTML instead of PNG
    -   Removed `get_pygraphviz_graph` method

### Fixed

- Fixed a bug where the `$nin` operator for metadata pre-filtering in retrievers would create an invalid Cypher query.


## 1.6.1

### Added

- Added the `run_with_context` method to `Component`. This method includes a `context_` parameter, which provides information about the pipeline from which the component is executed (e.g., the `run_id`). It also enables the component to send events to the pipeline's callback function.

### Fixed

- Added `enforce_schema` parameter to `SimpleKGPipeline` for optional schema enforcement.


## 1.6.0

### Added

- Added optional schema enforcement as a validation layer after entity and relation extraction.
- Introduced a linear hybrid search ranker for HybridRetriever and HybridCypherRetriever, allowing customizable ranking with an `alpha` parameter.
- Introduced SearchQueryParseError for handling invalid Lucene query strings in HybridRetriever and HybridCypherRetriever.

### Fixed

- Fixed config loading after module reload (usage in jupyter notebooks)

### Changed

- Qdrant retriever now fallbacks on the point ID if the `external_id_property` is not found in the payload.
- Updated a few dependencies, mainly `pypdf`, `anthropic` and `cohere`.


## 1.5.0

### Added

- Utility functions to retrieve metadata for vector and full-text indexes.
- Support for effective_search_ratio parameter in vector and hybrid searches.
- Introduced upsert_vectors utility function for batch upserting embeddings to vector indexes.
- Introduced `extract_cypher` function to enhance Cypher query extraction and formatting in `Text2CypherRetriever`.
- Introduced Neo4jMessageHistory and InMemoryMessageHistory classes for managing LLM message histories.
- Added examples and documentation for using message history with Neo4j and in-memory storage.
- Updated LLM and GraphRAG classes to support new message history classes.

### Changed

- Refactored index-related functions for improved compatibility and functionality.
- Added deprecation warnings to upsert_vector, upsert_vector_on_relationship functions in favor of upsert_vectors.
- Added deprecation warnings to async_upsert_vector, async_upsert_vector_on_relationship functions notifying developers that they will be removed in a future release.
- Added support for database, timeout, and sanitize arguments in schema functions.

### Fixed

- Resolved an issue with an incorrectly hard coded node alias in the `_handle_field_filter` function.

## 1.4.3

### Added

- Ability to add event listener to get notifications about Pipeline progress.
- Added py.typed so that mypy knows to use type annotations from the neo4j-graphrag package.
- Support for creating enhanced schemas with detailed property statistics.
- New utility functions for schema formatting and value sanitization.
- Updated unit and integration tests to cover enhanced schema functionality.

### Changed

- Changed the default behaviour of `FixedSizeSplitter` to avoid words cut-off in the chunks whenever it is possible.
- Refactored schema creation code to reduce duplication and improve maintainability.

### Fixed

- Removed the `uuid` package from dependencies (not needed with Python 3).
- Fixed a bug in the `AnthropicLLM` class preventing it from being used in `GraphRAG` pipeline.

## 1.4.2

### Fixed

- Fix a bug where the `OllamaEmbedder` would return a `list[list[float]]` instead of the expected `list[float]`.

## 1.4.1

### Fixed

#### Dependencies

- PyYAML dependency was missing and has been added.
- Weaviate was unintentionally added as a mandatory dependency in previous version, this behavior has been reverted.
- PyPDF and fsspec are not optional anymore so that SimpleKGPipeline examples can run out of the box (they just require the independent installation of openai python package if using OpenAI).

## 1.4.0

### Added
- Support for conversations with message history, including a new `message_history` parameter for LLM interactions.
- Ability to include system instructions in LLM invoke method.
- Summarization of chat history to enhance query embedding and context handling in GraphRAG.

### Changed
- Updated LLM implementations to handle message history consistently across providers.
- The `id_prefix` parameter in the `LexicalGraphConfig` is deprecated.

### Fixed
- IDs for the Document and Chunk nodes in the lexical graph are now randomly generated and unique across multiple runs, fixing issues in the lexical graph where relationships were created between chunks that were created by different pipeline runs.
- Improve logging for a better debugging experience: long lists and strings are now truncated. The max length can be controlled using the `LOGGING__MAX_LIST_LENGTH` and `LOGGING__MAX_STRING_LENGTH` env variables.

## 1.3.0

### Added
- Integrated `json-repair` package to handle and repair invalid JSON generated by LLMs.
- Introduced `InvalidJSONError` exception for handling cases where JSON repair fails.
- Ability to create a Pipeline or SimpleKGPipeline from a config file. See [the example](examples/build_graph/from_config_files/simple_kg_pipeline_from_config_file.py).
- Added `OllamaLLM` and `OllamaEmbeddings` classes to make Ollama support more explicit. Implementations using the `OpenAILLM` and `OpenAIEmbeddings` classes will still work.

### Changed
- Updated LLM prompt for Entity and Relation extraction to include stricter instructions for generating valid JSON.

### Fixed
- Added schema functions to the documentation.

## 1.2.1

### Added
- Introduced optional lexical graph configuration for `SimpleKGPipeline`, enhancing flexibility in customizing node labels and relationship types in the lexical graph.
- Introduced optional `neo4j_database` parameter for `SimpleKGPipeline`, `Neo4jChunkReader`and `Text2CypherRetriever`.
- Ability to provide description and list of properties for entities and relations in the `SimpleKGPipeline` constructor.

### Fixed
- `neo4j_database` parameter is now used for all queries in the `Neo4jWriter`.

### Changed
- Updated all examples to use `neo4j_database` parameter instead of an undocumented neo4j driver constructor.
- All `READ` queries are now routed to a reader replica (for clusters). This impacts all retrievers, the `Neo4jChunkReader` and `SinglePropertyExactMatchResolver` components.


## 1.2.0

### Added
- Made `relations` and `potential_schema` optional in `SchemaBuilder`.
- Added a check to prevent the use of deprecated Cypher syntax for Neo4j versions 5.23.0 and above.
- Added a `LexicalGraphBuilder` component to enable the import of the lexical graph (document, chunks) without performing entity and relation extraction.
- Added a `Neo4jChunkReader` component to be able to read chunk text from the database.

### Changed
- Vector and Hybrid retrievers used with `return_properties` now also return the node labels (`nodeLabels`) and the node's element ID (`id`).
- `HybridRetriever` now filters out the embedding property index in `self.vector_index_name` from the retriever result by default.
- Removed support for neo4j.AsyncDriver in the KG creation pipeline, affecting Neo4jWriter and related components.
- Updated examples and unit tests to reflect the removal of async driver support.

### Fixed
- Resolved issue with `AzureOpenAIEmbeddings` incorrectly inheriting from `OpenAIEmbeddings`, now inherits from `BaseOpenAIEmbeddings`.

## 1.1.0

### Added
- Introduced a `fail_if_exist` option to index creation functions to control behavior when an index already exists.
- Added Qdrant retriever in neo4j_graphrag.retrievers.

### Changed
- Comprehensive rewrite of the README to improve clarity and provide detailed usage examples.

## 1.0.0

### Fixed
- Fix a bug where `openai` Python client and `numpy` were required to import any embedder or LLM.

### Changed
- The value associated to the enum field `OnError.IGNORE` has been changed from "CONTINUE" to "IGNORE" to stick to the convention and match the field name.

### Added
- Added `SinglePropertyExactMatchResolver` component allowing to merge entities with exact same property (e.g. name)
- Added the `SimpleKGPipeline` class, a simplified abstraction layer to streamline knowledge graph building processes from text documents.

## 1.0.0a1

## 1.0.0a0

### Added
- Added `SinglePropertyExactMatchResolver` component allowing to merge entities with exact same property (e.g. name)

## 0.7.0

### Added
- Added AzureOpenAILLM and AzureOpenAIEmbeddings to support Azure served OpenAI models
- Added `template` validation in `PromptTemplate` class upon construction.
- Examples demonstrating the use of Mistral embeddings and LLM in RAG pipelines.
- Added feature to include kwargs in `Text2CypherRetriever.search()` that will be injected into a custom prompt, if provided.
- Added validation to `custom_prompt` parameter of `Text2CypherRetriever` to ensure that `query_text` placeholder exists in prompt.
- Introduced a fixed size text splitter component for splitting text into specified fixed size chunks with overlap. Updated examples and tests to utilize this new component.
- Introduced Vertex AI LLM class for integrating Vertex AI models.
- Added unit tests for the Vertex AI LLM class.
- Added support for Cohere LLM and embeddings - added optional dependency to `cohere`.
- Added support for Anthropic LLM - added optional dependency to `anthropic`.
- Added support for MistralAI LLM - added optional dependency to `mistralai`.
- Added support for Qdrant - added optional dependency to `qdrant-client`.

### Fixed
- Resolved import issue with the Vertex AI Embeddings class.
- Fixed bug in `Text2CypherRetriever` using `custom_prompt` arg where the `search` method would not inject the `query_text` content.
- `custom_prompt` arg is now converted to `Text2CypherTemplate` class within the `Text2CypherRetriever.get_search_results` method.
- `Text2CypherTemplate` and `RAGTemplate` prompt templates now require `query_text` arg and will error if it is not present. Previous `query_text` aliases may be used, but will warn of deprecation.
- Resolved issue where Neo4jWriter component would raise an error if the start or end node ID was not defined properly in the input.
- Resolved issue where relationship types was not escaped in the insert Cypher query.
- Improved query performance in Neo4jWriter: created nodes now have a generic `__KGBuilder__` label and an index is created on the `__KGBuilder__.id` property. Moreover, insertion queries are now batched. Batch size can be controlled using the `batch_size` parameter in the `Neo4jWriter` component.

### Changed
- Moved the Embedder class to the neo4j_graphrag.embeddings directory for better organization alongside other custom embedders.
- Removed query argument from the GraphRAG class' `.search` method; users must now use `query_text`.
- Neo4jWriter component now runs a single query to merge node and set its embeddings if any.
- Nodes created by the `Neo4jWriter` now have an extra `__KGBuilder__` label. Nodes from the entity graph also have an `__Entity__` label.
- Dropped support for Python 3.8 (end of life).

## 0.6.3
### Changed
- Updated documentation links in README.
- Renamed deprecated package references in documentation.

### Added
- Introduction page to the documentation content tree.
- Introduced a new Vertex AI embeddings class for generating text embeddings using Vertex AI.
- Updated documentation to include OpenAI and Vertex AI embeddings classes.
- Added google-cloud-aiplatform as an optional dependency for Vertex AI embeddings.

### Fixed
- Make `pygraphviz` an optional dependency - it is now only required when calling `pipeline.draw`.

## 0.6.2

### Fixed
- Moved pygraphviz to optional dependencies under [tool.poetry.extras] in pyproject.toml to resolve an issue where pip install neo4j-graphrag incorrectly required pygraphviz as a mandatory dependency.

## 0.6.1

### Changed
- Officially renamed neo4j-genai to neo4j-graphrag. For the final release version of neo4j-genai, please visit https://pypi.org/project/neo4j-genai/.

## 0.6.0

### IMPORTANT NOTICE
- The `neo4j-genai` package is now deprecated. Users are advised to switch to the new package `neo4j-graphrag`.
### Added
- Ability to visualise pipeline with `my_pipeline.draw("pipeline.png")`.
- `LexicalGraphBuilder` component to create the lexical graph without entity-relation extraction.

### Fixed
- Pipelines now return correct results when the same pipeline is run in parallel.

### Changed
- Pipeline run method now return a PipelineResult object.
- Improved parameter validation for pipelines (#124). Pipeline now raise an error before a run starts if:
  - the same parameter is mapped twice
  - or a parameter is defined in the mapping but is not a valid component input


## 0.5.0

### Added
- PDF-to-graph pipeline for knowledge graph construction in experimental mode
- Introduced support for Component/Pipeline flexible architecture.
- Added new components for knowledge graph construction, including text splitters, schema builders, entity-relation extractors, and Neo4j writers.
- Implemented end-to-end tests for the new knowledge graph builder pipeline.

### Changed
- When saving the lexical graph in a KG creation pipeline, the document is also saved as a specific node, together with relationships between each chunk and the document they were created from.

### Fixed
- Corrected the hybrid retriever query to ensure proper normalization of scores in vector search results.

## 0.4.0

### Added
- Add optional custom_prompt arg to the Text2CypherRetriever class.

### Changed
- `GraphRAG.search` method first parameter has been renamed `query_text` (was `query`) for consistency with the retrievers interface.
- Made `GraphRAG.search` method backwards compatible with the query parameter, raising warnings to encourage using query_text instead.

## 0.3.1

### Fixed
-   Corrected initialization to allow specifying the embedding model name.
-   Removed sentence_transformers from embeddings/__init__.py to avoid ImportError when the package is not installed.

## 0.3.0

### Added
-   Stopped embeddings from being returned when searching with `VectorRetriever`. Added `nodeLabels` and `id` to the metadata of `VectorRetriever` results.
-   Added `upsert_vector` utility function for attaching vectors to node properties.
-   Introduced `Neo4jInsertionError` for handling insertion failures in Neo4j.
-   Included Pinecone and Weaviate retrievers in neo4j_graphrag.retrievers.
-   Introduced the GraphRAG object, enabling a full RAG (Retrieval-Augmented Generation) pipeline with context retrieval, prompt formatting, and answer generation.
-   Added PromptTemplate and RagTemplate for customizable prompt generation.
-   Added LLMInterface with implementation for OpenAI LLM.
-   Updated project configuration to support multiple Python versions (3.8 to 3.12) in CI workflows.
-   Improved developer experience by copying the docstring from the `Retriever.get_search_results` method to the `Retriever.search` method
-   Support for specifying database names in index handling methods and retrievers.
-   User Guide in documentation.
-   Introduced result_formatter argument to all retrievers, allowing custom formatting of retriever results.

### Changed
-   Refactored import paths for retrievers to neo4j_graphrag.retrievers.
-   Implemented exception chaining for all re-raised exceptions to improve stack trace readability.
-   Made error messages in `index.py` more consistent.
-   Renamed `Retriever._get_search_results` to `Retriever.get_search_results`
-   Updated retrievers and index handling methods to accept optional database names.

## 0.2.0

### Fixed

-   Removed Pinecone and Weaviate retrievers from **init**.py to prevent ImportError when optional dependencies are not installed.
-   Moved few-shot examples in `Text2CypherRetriever` to the constructor for better initialization and usage. Updated unit tests and example script accordingly.
-   Fixed regex warnings in E2E tests for Weaviate and Pinecone retrievers.
-   Corrected HuggingFaceEmbeddings import in E2E tests.


## 0.2.0a5

## 0.2.0a3

### Added

-   Introduced custom exceptions for improved error handling, including `RetrieverInitializationError`, `SearchValidationError`, `FilterValidationError`, `EmbeddingRequiredError`, `RecordCreationError`, `Neo4jIndexError`, and `Neo4jVersionError`.
-   Retrievers that integrates with a Weaviate vector database: `WeaviateNeo4jRetriever`.
-   New return types that help with getting retriever results: `RetrieverResult` and `RetrieverResultItem`.
-   Supported wrapper embedder object for sentence-transformers embeddings: `SentenceTransformerEmbeddings`.
-   `Text2CypherRetriever` object which allows for the retrieval of records from a Neo4j database using natural language.

### Changed

-   Replaced `ValueError` with custom exceptions across various modules for clearer and more specific error messages.

### Fixed

-   Updated documentation to include new custom exceptions.
-   Improved the use of Pydantic for input data validation for retriever objects.
