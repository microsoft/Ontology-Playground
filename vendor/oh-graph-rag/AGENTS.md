# AGENTS.md

Learnings and patterns for future agents working on this project.

## Project Overview

PRIMARY LANGUAGES: Python

USAGE CONTEXT: Python is the sole programming language used for this project. It's a Python package (neo4j-graphrag) designed to facilitate Neo4j's GraphRAG (Graph Retrieval-Augmented Generation) features. The codebase contains:

- **Core library code** in `src/neo4j_graphrag/` with modules for embeddings, retrievers (vector, hybrid, text2cypher), LLM integrations (OpenAI, Anthropic, Cohere, Mistral, Ollama, VertexAI), generation, and utilities
- **Experimental pipeline framework** with orchestration, component system, and configuration management
- **External integrations** for vector databases (Weaviate, Pinecone, Qdrant)
- **Unit and e2e tests** in the `tests/` directory
- **Examples** demonstrating library usage
- **Documentation** via Sphinx (in `docs/` with theme customization)

Project uses uv for dependency management (pyproject.toml), pytest for testing, mypy for type checking, and ruff for linting. No other programming languages are present in the active codebase.

## Build System

BUILD SYSTEMS: Poetry, Hatchling, Sphinx, Make
BUILD COMMANDS: uv run pytest tests/unit/, uv run ruff format --check ., uv run ruff check . --fix, uv run mypy ., make html (in docs/)
BUNDLING: Hatchling (wheel builder)

## Testing Framework

TESTING FRAMEWORKS: pytest, coverage

TEST COMMANDS:
- Unit tests: `poetry run pytest tests/unit/` (per project instructions) or `uv run pytest tests/unit`
- E2E tests: `uv run pytest tests/e2e`
- Coverage check: `uv run coverage run -m pytest tests/unit && uv run coverage report --fail-under=90`

TEST ORGANIZATION:
- Split into `tests/unit/` and `tests/e2e/` directories
- Unit tests organized by feature (embeddings/, llm/, retrievers/, tool/, experimental/)
- Fixture-based setup via conftest.py files at root and module levels
- Mocking via `unittest.mock` (MagicMock, patch)
- Pytest markers for enterprise-only tests (defined in tests/e2e/pytest.ini)
- Coverage enforced at 90% threshold

E2E TESTING:
- Dedicated `tests/e2e/` directory with separate pytest.ini markers
- E2E tests for indexes, GraphRAG v2, entity resolver, graph pruning, pipeline runner
- Scheduled E2E runs via GitHub Actions (scheduled-e2e-tests.yaml, pr-e2e-tests.yaml)
- Requires live Neo4j instance (not mocked like unit tests)

## Architecture

ARCHITECTURE PATTERN: Modular Multi-Provider RAG Framework with Neo4j-Native Knowledge Graph Integration

DIRECTORY STRUCTURE: Layered package organization with provider abstraction - `src/neo4j_graphrag/` contains core layers (embeddings/, generation/, llm/, retrievers/, experimental/), each implementing specific responsibilities. External dependencies (Weaviate, Pinecone, Qdrant) isolated in retrievers/external/. Experimental features segregated in experimental/ with pipeline and component subsystems.

DESIGN PATTERNS: Template Method (Retriever base with abstract get_search_results), Strategy Pattern (multiple retriever/LLM implementations), Provider Pattern (pluggable LLM/embedding/vector DB adapters), Adapter/Bridge Pattern (external DB wrappers), Component/DAG Pattern (experimental pipeline with configurable components), Factory-like Configuration (AbstractPipelineConfig instantiation from dicts), Observer Pattern (EventNotifier callbacks).

DATABASE: Neo4j-native architecture with three query categories - vector search via `db.index.vector.queryNodes()`, fulltext via `db.index.fulltext.queryNodes()`, and schema introspection via APOC (`apoc.meta.data()`, `apoc.schema.nodes()`). Message history persisted as linked Message nodes. Cypher builders in neo4j_queries.py support batch operations and variable scope clauses (Neo4j 5.x+).

API DESIGN: RAG pipeline follows init→compose→search flow with polymorphic `search(query_text, top_k, filters, retriever_config)` returning `RetrieverResult` objects. Dual LLM interface (`LLMInterface` legacy, `LLMInterfaceV2` current) with standardized `invoke(input, message_history, system_instruction)`. Configuration via YAML/dict at three levels: pipeline-wide, environment-based (API keys), and runtime parameters (retriever_config dict).

## Deployment

DEPLOYMENT STRATEGY: **PyPI package distribution with GitHub Actions CI/CD pipeline**

CONTAINERIZATION: **Not containerized. Project designed as a Python library, not a containerized application. E2E tests use Docker Compose for service dependencies (Neo4j, Weaviate, Qdrant) but the package itself is distributed as a pure Python wheel.**

CI/CD: **GitHub Actions with multi-stage pipeline:**
- **PR workflow** (pr.yaml): Multi-version testing (Python 3.10-3.14), linting via Ruff, type checking via MyPy, unit tests with 90% coverage requirement
- **Release workflows**: Automated semver-based releases (patch, minor, major, pre-release, premajor) triggered on tags
- **E2E workflow** (scheduled-e2e-tests.yaml): Runs Mon/Thu against Neo4j community/enterprise/latest + Weaviate + Qdrant + Qdrant, tests all Python versions
- **Publish workflow** (publish.yaml): Builds wheel/sdist and publishes to PyPI on tagged releases using OIDC token authentication

HOSTING: **PyPI (Python Package Index) - distributed as `neo4j-graphrag` package. End-users install via `pip install neo4j-graphrag[optional-extras]`. No server-side hosting required. Examples provided for integration into user applications.**

ENVIRONMENT MANAGEMENT:
- **Dependencies**: Managed via Poetry/uv with pyproject.toml and uv.lock. Supports Python 3.10-3.14 with version-specific constraints (numpy/scipy vary by Python version)
- **Optional extras**: 9 feature groups (openai, anthropic, ollama, google, cohere, mistralai, weaviate, pinecone, qdrant, sentence-transformers, kg_creation_tools, nlp, fuzzy-matching, experimental, examples)
- **Dev dependencies**: Ruff (linting), MyPy (type checking), Pytest (testing), Coverage (90% threshold), Sphinx (docs)
- **.env file**: Present locally for configuration (likely for test/example credentials)
- **Test infrastructure**: Uses Docker for E2E service orchestration; no production deployment infrastructure needed
- **Core dependencies**: neo4j SDK, pydantic for data validation, fsspec for file operations

**Key characteristics:**
- Library-first design (no web server, containerization, or database migrations)
- Rigorous testing: unit tests on all supported Python versions, E2E against multiple Neo4j editions
- Semantic versioning with automated release pipeline
- Type-safe with strict MyPy checking
- Optional LLM provider integrations (OpenAI, Anthropic, Ollama, Cohere, Google, MistralAI)
- Vector DB support (Weaviate, Pinecone, Qdrant)
- Documentation via Sphinx; published separately

---

*This AGENTS.md was generated using agent-based project discovery.*
