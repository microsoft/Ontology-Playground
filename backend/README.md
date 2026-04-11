# Alignment API

Standalone FastAPI service for Phase 1 of the ontology alignment workflow.

Scope:
- graph generation from user-authored ontology drafts
- schema version lookup
- schema draft save
- queue retrieval
- candidate lock
- review submission

Current implementation:
- uses an in-memory mock repository
- persists state only for the running process
- prioritizes workflow correctness over infrastructure integration
- projects the submitted ontology into a graph payload plus review queue
- supports phased extraction modes:
  - default `auto` mode, which uses LLM extraction only when both runtime and LLM configuration are ready
  - fallback heuristic/schema-guided extraction when `auto` is selected but LLM extraction is not fully configured
  - explicit `neo4j_graphrag` mode, which forces LLM extraction and fails clearly if runtime or credentials are missing

Run locally:

```bash
cd backend
python -m venv .venv310
.venv310/bin/pip install -e .
set -a
source .env
set +a
.venv310/bin/python -m uvicorn app.main:app --reload
```

Primary routes:
- `POST /api/graph/generate`
- `POST /api/ontology/generate-draft`
- `GET /api/schema/versions/{schema_version_id}`
- `POST /api/schema/drafts`
- `GET /api/queue`
- `POST /api/queue/{candidate_id}/lock`
- `POST /api/reviews`
- `POST /api/query/diagnostic-chat`
- `POST /api/query/translate-cypher`
- `POST /api/query/neo4j`

## How provider selection works

`ALIGNMENT_LLM_PROVIDER=auto` is environment-driven, not health-check-driven.

The backend resolves `auto` like this:

- if `AZURE_OPENAI_KEY` or `AZURE_OPENAI_API_KEY` is set
- and `AZURE_OPENAI_ENDPOINT` is set
- and `AZURE_OPENAI_DEPLOYMENT` is set

then it uses `azure_openai`.

Otherwise it uses `openai`, backed by `ALIGNMENT_OPENAI_API_KEY` or `OPENAI_API_KEY`.

`auto` does not compare latency, quality, or connectivity. It only checks whether Azure configuration is complete.

## How extraction mode works

- `ALIGNMENT_EXTRACTION_MODE=neo4j_graphrag`
  Forces LLM extraction through the vendored `neo4j-graphrag` runtime. If runtime dependencies or provider credentials are missing, the request fails.
- `ALIGNMENT_EXTRACTION_MODE=auto`
  If `neo4j-graphrag` is installed and the selected provider is fully configured, LLM extraction is used.
  Otherwise the backend falls back to the heuristic `SchemaGuidedExtractor`.

This means `POST /api/graph/generate` can succeed even when LLM extraction is not configured, but the queue quality will be lower because the fallback is pattern-based rather than model-based.

## Feature-by-feature LLM usage

- `POST /api/ontology/generate-draft`
  Uses OpenAI Responses API with strict JSON schema output for ontology generation.
- `POST /api/query/diagnostic-chat`
  Uses OpenAI Responses API for a plain-text connectivity check.
- `POST /api/query/translate-cypher`
  Uses OpenAI Responses API with strict JSON schema output for `{ cypher, summary, warnings }`.
- `POST /api/query/neo4j`
  Does not use OpenAI. It only runs Cypher against Neo4j.

Extraction mode env vars:
- `ALIGNMENT_EXTRACTION_MODE=auto|neo4j_graphrag`
- `ALIGNMENT_NEO4J_GRAPHRAG_SRC=/abs/path/to/vendor/oh-graph-rag/src`
- `ALIGNMENT_LLM_PROVIDER=auto|openai|azure_openai`
- OpenAI mode:
  `ALIGNMENT_OPENAI_API_KEY` or standard `OPENAI_API_KEY`
- `ALIGNMENT_OPENAI_MODEL` default: `gpt-5`
- `ALIGNMENT_OPENAI_BASE_URL` optional
- `ALIGNMENT_OPENAI_ORGANIZATION` optional
- `ALIGNMENT_OPENAI_PROJECT` optional
- Azure OpenAI mode:
  `AZURE_OPENAI_KEY` or `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `ALIGNMENT_LLM_TEMPERATURE` default: `0`
- `ALIGNMENT_EXTRACTION_MAX_CONCURRENCY` default: `4`

## Docker notes

For the root local compose file:

- backend defaults to `ALIGNMENT_LLM_PROVIDER=openai`
- local Neo4j is started automatically
- frontend talks to backend through `/backend-api`

For `docker-compose.company.yml`:

- backend defaults to `ALIGNMENT_LLM_PROVIDER=auto`
- no local Neo4j container is started
- you must provide external `NEO4J_*` environment variables

Recommended approach in production-like deployments:

- use `ALIGNMENT_LLM_PROVIDER=openai` when you want deterministic OpenAI routing
- use `ALIGNMENT_LLM_PROVIDER=azure_openai` when you want deterministic Azure routing
- use `auto` only when the Azure-vs-OpenAI fallback behavior is intentional
