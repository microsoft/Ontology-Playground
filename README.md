# Oh-tology

Self-contained ontology design, extraction review, graph generation, and Neo4j publishing workspace.

## Layout

- `frontend/` — React/Vite application
- `backend/` — FastAPI workflow backend
- `vendor/oh-graph-rag/` — vendored `neo4j-graphrag` dependency
- `frontend/library/ontologies/` — local ontology library
- `frontend/library/graphs/` — local graph library

## Frontend

```bash
cd frontend
npm install
VITE_ALIGNMENT_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## Backend

```bash
cd backend
python -m venv .venv310
.venv310/bin/pip install -e .
set -a
source .env
set +a
.venv310/bin/python -m uvicorn app.main:app --reload
```

## Neo4j Publish

Add the following to `backend/.env`:

```env
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j
```

The Graph tab supports:
- preview publish
- publish to Neo4j
- ingest run id tagging

## Local Library

Ontologies are stored under:
- `frontend/library/ontologies/`

Graphs are stored under:
- `frontend/library/graphs/`

These library contents are intended to be committed with the repository.

## Vendored dependency

`vendor/oh-graph-rag/` contains a vendored copy of `neo4j-graphrag-python`.
Keep upstream licensing files intact.
