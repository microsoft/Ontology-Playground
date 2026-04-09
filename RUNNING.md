# Running Oh-tology

## Purpose

Oh-tology is a self-contained workspace for:
- authoring ontology schemas
- generating ontology drafts with AI
- extracting graph candidates from source files
- reviewing and approving extracted graph facts
- generating instance graphs
- saving ontology and graph snapshots to a local library
- previewing and publishing approved graphs to Neo4j

## Directory structure

- `frontend/`
  React/Vite application
- `backend/`
  FastAPI workflow backend
- `vendor/oh-graph-rag/`
  Vendored graph extraction dependency
- `frontend/library/ontologies/`
  Local ontology library
- `frontend/library/graphs/`
  Local graph library

## 1. Backend setup

```bash
cd backend
python -m venv .venv310
.venv310/bin/pip install -e .
cp .env.example .env
```

Edit `.env` and provide at least:

```env
ALIGNMENT_OPENAI_API_KEY=...
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j
```

Run the backend:

```bash
set -a
source .env
set +a
.venv310/bin/python -m uvicorn app.main:app --reload
```

## 2. Frontend setup

```bash
cd frontend
npm install
VITE_ALIGNMENT_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## 3. Main workflow

1. Open the frontend.
2. Use `Designer` to author or AI-generate an ontology schema.
3. Save ontology drafts to `library/ontologies/`.
4. Use `Review` to upload files and extract graph candidates.
5. Approve candidates and generate an instance graph.
6. Save graph snapshots to `library/graphs/`.
7. Publish approved graphs to Neo4j with an `ingest_run_id`.

## 4. Neo4j query workflow

After publish:
- use the main-page `Query` tab
- choose `Ingest Run` or `Cypher`
- inspect the Neo4j graph directly

## 5. GitHub upload

Commit the whole `Oh-tology/` directory.

Included:
- source code
- backend
- frontend
- local libraries
- vendored dependency

Excluded by `.gitignore`:
- virtual environments
- local `.env`
- caches
- build artifacts
