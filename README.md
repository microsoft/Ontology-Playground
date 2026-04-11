[English](./README.md) | [한국어](./README.ko.md)

# Oh-tology

Oh-tology is a local workspace for designing ontologies, reviewing document-grounded extraction results, approving them into a graph, publishing to Neo4j, and querying the published graph.

[![Oh-tology workspace](docs/images/main_graph.png)](docs/images/main_graph.png)

## Core Features

- Visual ontology design
- AI-assisted ontology draft generation
- Document-grounded entity and relationship extraction review
- Instance graph generation from approved review results
- Neo4j publish and Cypher / natural-language query flows
- Local ontology and graph snapshot libraries

## Product Flow

1. Generate an ontology draft from prompts or reference documents.
2. Refine entities, properties, and relationships in the designer.
3. Map attached documents onto the current ontology to produce extraction candidates.
4. Review and approve candidates.
5. Build the approved graph.
6. Optionally publish to Neo4j and run queries.

## Screens

### Main Schema Workspace

![Oh-tology main schema workspace](docs/images/main_schema.png)

### AI Ontology Draft Generation

![Ontology draft generation from prompt](docs/images/generate_ontology_with_prompt.png)

### Review and Graph Workflow

![Review and graph workflow](docs/images/review_graph.png)

### Natural Language to Cypher

![Natural language to Cypher query flow](docs/images/cypherquery.png)

## Repository Layout

```text
Oh-tology/
├── frontend/                     React + Vite app
├── backend/                      FastAPI backend
├── vendor/oh-graph-rag/          Vendored extraction runtime
├── frontend/library/ontologies/  Local ontology snapshots
├── frontend/library/graphs/      Local graph snapshots
├── docs/                         Images and docs
└── RUNNING.md                    Short operational notes
```

## Local Development

### Requirements

- Node.js 18+
- npm 9+
- Python 3.10+
- Optional: Neo4j
- Optional: OpenAI or Azure OpenAI credentials

### Backend

```bash
cd backend
python -m venv .venv310
.venv310/bin/pip install -e .
cp .env.example .env
```

Minimal example:

```env
ALIGNMENT_EXTRACTION_MODE=neo4j_graphrag
ALIGNMENT_LLM_PROVIDER=openai
ALIGNMENT_OPENAI_API_KEY=...
NEO4J_URI=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
NEO4J_DATABASE=neo4j
```

Run:

```bash
cd backend
set -a
source .env
set +a
.venv310/bin/python -m uvicorn app.main:app --reload
```

Backend: `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
npm install
VITE_ALIGNMENT_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Frontend: `http://127.0.0.1:5173`

## Docker

Docker environment variables directly control backend runtime behavior. In practice, LLM settings affect ontology draft generation, extraction, and natural-language-to-Cypher translation.

### Local Full Stack

Included services:

- `frontend` on `http://localhost:8080`
- `backend` on `http://localhost:8000`
- `neo4j` on `http://localhost:7474` and `localhost:7687`

Run:

```bash
cp .env.docker.example .env
docker compose up --build
```

The default `.env.docker.example` assumes:

- `ALIGNMENT_EXTRACTION_MODE=auto`
- `ALIGNMENT_LLM_PROVIDER=auto`
- local containerized Neo4j
- OpenAI or Azure OpenAI credentials supplied by the operator

Recommended setup order:

1. `cp .env.docker.example .env`
2. Decide whether you want OpenAI or Azure OpenAI.
3. Fill only the relevant credential block.
4. Run `docker compose up --build`

Check:

- frontend: `http://localhost:8080`
- backend health: `http://localhost:8000/health`
- Neo4j Browser: `http://localhost:7474`

OpenAI example:

```env
ALIGNMENT_LLM_PROVIDER=openai
ALIGNMENT_OPENAI_API_KEY=<openai-api-key>
ALIGNMENT_OPENAI_MODEL=gpt-5.4
```

Azure OpenAI example:

```env
ALIGNMENT_LLM_PROVIDER=azure_openai
AZURE_OPENAI_KEY=<azure-openai-key>
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=<deployment-name>
```

### Company Neo4j Deployment

Use [docker-compose.company.yml](docker-compose.company.yml) when the backend should connect directly to an external Neo4j instance instead of starting a local Neo4j container.

Required assets:

- Docker image tar archive
- [docker-compose.company.yml](docker-compose.company.yml)
- `.env`
- Recommended: `frontend/library/`

`.env` example:

```env
NEO4J_URI=bolt://<company-neo4j-host>:7687
NEO4J_USERNAME=<username>
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=neo4j
ALIGNMENT_LLM_PROVIDER=azure_openai
AZURE_OPENAI_KEY=...
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=<deployment-name>
```

Run:

```bash
docker compose -f docker-compose.company.yml up -d
```

## LLM Behavior

### What does `ALIGNMENT_LLM_PROVIDER=auto` actually do?

`auto` does not choose based on latency, quality, or connection tests. It chooses based on environment variables only.

If all three Azure settings are present:

- `AZURE_OPENAI_KEY` or `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`

then the backend resolves `auto -> azure_openai`.

If any of those are missing, it resolves `auto -> openai`.
For OpenAI, the backend uses `ALIGNMENT_OPENAI_API_KEY` or `OPENAI_API_KEY`.

So `auto` means "prefer Azure when Azure is fully configured, otherwise use OpenAI", not "pick whichever works best right now".

### Which feature uses which path?

- Ontology draft generation:
  `POST /api/ontology/generate-draft`
  Uses OpenAI Responses API with strict JSON schema output.
- Run extraction:
  `POST /api/graph/generate`
  Normalizes the ontology and produces an extraction review queue.
- Natural language to Cypher:
  `POST /api/query/translate-cypher`
  Uses strict JSON schema output for `{ cypher, summary, warnings }`.
- Cypher execution:
  `POST /api/query/neo4j`
  Runs directly against Neo4j. This step does not use OpenAI.

### `ALIGNMENT_EXTRACTION_MODE`

- `neo4j_graphrag`
  Forces LLM-based extraction. If runtime dependencies, credentials, endpoint, or deployment are missing, the request fails clearly.
- `auto`
  Default mode.
  If the `neo4j-graphrag` runtime and the selected provider configuration are both ready, LLM extraction is used.
  Otherwise the backend falls back to heuristic/schema-guided extraction.

This makes `auto` the safer mode for mixed local environments, while `neo4j_graphrag` is better when you explicitly want strict LLM extraction behavior.

### Debugging Tips

- Draft generation fails:
  Check the `/api/ontology/generate-draft` response body and `details.error` in the browser Network tab.
- Extraction looks too simple:
  Verify `ALIGNMENT_EXTRACTION_MODE` and the selected provider credentials.
- Natural-language to Cypher fails:
  Check `/api/query/translate-cypher` and inspect `details.error`.
- Cypher execution fails:
  Verify `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and `NEO4J_DATABASE`.

## Docker Image Transfer

### 1. Build Linux `amd64` Images

If the target server is a typical x86 Linux host, `linux/amd64` is the safest target platform.

```bash
docker buildx build --platform linux/amd64 -t oh-tology-frontend:latest -f frontend/Dockerfile . --load
docker buildx build --platform linux/amd64 -t oh-tology-backend:latest -f backend/Dockerfile . --load
docker save -o oh-tology-images-linux-amd64.tar oh-tology-frontend:latest oh-tology-backend:latest
```

Check:

```bash
docker image inspect oh-tology-frontend:latest --format '{{.Architecture}}/{{.Os}}'
docker image inspect oh-tology-backend:latest --format '{{.Architecture}}/{{.Os}}'
```

### 2. Files to Transfer

For runtime only:

- `oh-tology-images-linux-amd64.tar`
- [docker-compose.company.yml](docker-compose.company.yml)
- `.env`

To keep existing library data as well:

- `frontend/library/`

### 3. Run on the Target Server

If containers already exist, stop them first.

```bash
docker compose -f docker-compose.company.yml down
docker load -i oh-tology-images-linux-amd64.tar
mkdir -p frontend/library/ontologies frontend/library/graphs
docker compose -f docker-compose.company.yml up -d
```

Check:

```bash
docker compose -f docker-compose.company.yml ps
curl http://localhost:8000/health
```

### 4. `scp` Example

```bash
scp oh-tology-images-linux-amd64.tar user@host:/path/to/deploy/
scp docker-compose.company.yml user@host:/path/to/deploy/
scp .env user@host:/path/to/deploy/
rsync -av frontend/library/ user@host:/path/to/deploy/frontend/library/
```

## Useful Commands

### Frontend

```bash
cd frontend
npm run dev
npm test
npm run build
npm run lint
```

### Backend

```bash
cd backend
.venv310/bin/pytest tests/test_api.py -q
```

## Key Environment Variables

### Frontend

| Variable | Description |
| --- | --- |
| `VITE_ALIGNMENT_API_BASE_URL` | FastAPI backend base URL |
| `VITE_ENABLE_AI_BUILDER` | AI ontology draft UI toggle |
| `VITE_BASE_PATH` | Vite base path |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth client id |
| `VITE_GITHUB_OAUTH_BASE` | External OAuth proxy base |

### Backend

| Variable | Description |
| --- | --- |
| `ALIGNMENT_EXTRACTION_MODE` | `auto` or `neo4j_graphrag`; `auto` uses LLM extraction only when runtime and provider config are ready |
| `ALIGNMENT_NEO4J_GRAPHRAG_SRC` | Optional source override |
| `ALIGNMENT_LLM_PROVIDER` | `auto`, `openai`, `azure_openai`; `auto` prefers Azure only when all Azure env vars are present |
| `ALIGNMENT_OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_API_KEY` | OpenAI fallback env |
| `ALIGNMENT_OPENAI_MODEL` | OpenAI model |
| `ALIGNMENT_OPENAI_BASE_URL` | Optional OpenAI-compatible base URL |
| `ALIGNMENT_OPENAI_ORGANIZATION` | Optional OpenAI org |
| `ALIGNMENT_OPENAI_PROJECT` | Optional OpenAI project |
| `AZURE_OPENAI_KEY` | Azure OpenAI key |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key alias |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI OpenAI-compatible base URL, ideally ending with `/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT` | Azure deployment name |
| `ALIGNMENT_OPENAI_TIMEOUT_SECONDS` | LLM request timeout in seconds |
| `ALIGNMENT_LLM_TEMPERATURE` | Extraction temperature |
| `ALIGNMENT_EXTRACTION_MAX_CONCURRENCY` | Extraction concurrency |
| `NEO4J_URI` | Neo4j URI |
| `NEO4J_USERNAME` | Neo4j username |
| `NEO4J_PASSWORD` | Neo4j password |
| `NEO4J_DATABASE` | Neo4j database |

## References

- [RUNNING.md](RUNNING.md)
- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

## Vendored Dependency

`vendor/oh-graph-rag/` is a vendored copy of the extraction runtime. Preserve license and notice files when updating it.
