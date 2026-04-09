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
  - default `auto` / heuristic path for local development
  - explicit `neo4j_graphrag` mode, which currently validates runtime readiness and fails clearly until the package/runtime is wired

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
- `GET /api/schema/versions/{schema_version_id}`
- `POST /api/schema/drafts`
- `GET /api/queue`
- `POST /api/queue/{candidate_id}/lock`
- `POST /api/reviews`

Extraction mode env vars:
- `ALIGNMENT_EXTRACTION_MODE=auto|neo4j_graphrag`
- `ALIGNMENT_NEO4J_GRAPHRAG_SRC=/abs/path/to/vendor/oh-graph-rag/src`
- `ALIGNMENT_LLM_PROVIDER=openai`
- `ALIGNMENT_OPENAI_API_KEY` or standard `OPENAI_API_KEY`
- `ALIGNMENT_OPENAI_MODEL` default: `gpt-5`
- `ALIGNMENT_OPENAI_BASE_URL` optional
- `ALIGNMENT_OPENAI_ORGANIZATION` optional
- `ALIGNMENT_OPENAI_PROJECT` optional
- `ALIGNMENT_LLM_TEMPERATURE` default: `0`
- `ALIGNMENT_EXTRACTION_MAX_CONCURRENCY` default: `4`
