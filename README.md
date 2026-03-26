# MemoClaw 🧠

**Self-hosted memory engine for AI agents** — a supermemory.ai-compatible service that runs on your local VPS in a Docker container.

## What is MemoClaw?

MemoClaw is a persistent memory and context layer for AI agents. It automatically:

- **Extracts facts** from conversations and documents
- **Builds user profiles** (static facts + dynamic context)
- **Handles knowledge updates** and contradictions via a graph structure
- **Forgets expired information** automatically
- **Delivers relevant context** via hybrid search (semantic + keyword)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  MemoClaw API                     │
│              (FastAPI + async)                     │
├─────────────────────────────────────────────────┤
│  Documents  │  Memories  │  Search  │  Profiles  │
├─────────────────────────────────────────────────┤
│           Memory Engine (Graph + LLM)            │
│  ┌──────────┬──────────┬──────────────────────┐  │
│  │ Extract  │ Relate   │ Forget/Decay         │  │
│  └──────────┴──────────┴──────────────────────┘  │
├─────────────────────────────────────────────────┤
│  LLM Provider (OpenRouter / OpenAI / Ollama)     │
├─────────────────────────────────────────────────┤
│  PostgreSQL + pgvector  │  Embedding Model       │
└─────────────────────────────────────────────────┘
```

## Features

- **Supermemory-compatible REST API** — drop-in replacement
- **Multi-provider LLM support** — OpenRouter, OpenAI, Ollama, any OpenAI-compatible endpoint
- **Graph memory** — updates, extends, derives relationships
- **User profiles** — auto-maintained static + dynamic facts
- **Hybrid search** — semantic (vector) + keyword (full-text) + memory graph
- **Container tags** — scope memories per user/project/tenant
- **Automatic forgetting** — time-based decay, contradiction resolution
- **Document processing** — text, URLs, conversations
- **Batch operations** — bulk add documents
- **Docker-first** — single `docker compose up`

## Web UI

MemoClaw includes a built-in dashboard at `http://localhost:8420/`:

- **📊 Dashboard** — Overview with stats, recent memories and documents
- **💭 Memories** — Browse, filter, add, and forget memories
- **📄 Documents** — Manage ingested documents
- **🕸️ Graph** — Interactive memory graph visualization (pan, zoom, hover)
- **👤 Profiles** — View auto-built user profiles (static + dynamic facts)
- **🔍 Search** — Semantic search across all memories
- **⌨️ Ctrl+K** — Quick jump to search

Enter your API key in the sidebar to authenticate.

## Quick Start

```bash
# 1. Clone and configure
cd memoclaw
cp .env.example .env
# Edit .env with your LLM provider API key

# 2. Start everything
docker compose up -d

# 3. Test it
curl http://localhost:8420/health

# 4. Add a memory
curl -X POST http://localhost:8420/v1/documents \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"content": "User loves TypeScript and prefers functional patterns", "containerTag": "user_123"}'

# 5. Search memories
curl -X POST http://localhost:8420/v1/search/memories \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"q": "programming preferences", "containerTag": "user_123"}'

# 6. Get user profile
curl -X POST http://localhost:8420/v1/profile \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"containerTag": "user_123"}'
```

## Configuration

| Variable | Description | Default |
|---|---|---|
| `MEMOCLAW_API_KEY` | API key for auth | `mc-changeme` |
| `LLM_PROVIDER` | `openrouter`, `openai`, `ollama`, or `custom` | `openrouter` |
| `LLM_API_KEY` | API key for your LLM provider | — |
| `LLM_BASE_URL` | Custom base URL (for Ollama/custom) | — |
| `LLM_MODEL` | Model to use for extraction/reasoning | `openai/gpt-4o-mini` |
| `EMBEDDING_PROVIDER` | `openai`, `ollama`, or `custom` | `openai` |
| `EMBEDDING_MODEL` | Embedding model name | `text-embedding-3-small` |
| `EMBEDDING_API_KEY` | API key for embedding provider | — |
| `EMBEDDING_BASE_URL` | Custom embedding endpoint | — |
| `EMBEDDING_DIMENSIONS` | Vector dimensions | `1536` |
| `DATABASE_URL` | PostgreSQL connection string | (set by compose) |
| `PORT` | API port | `8420` |

## API Endpoints

### Documents
- `POST /v1/documents` — Add a document
- `POST /v1/documents/batch` — Batch add documents
- `GET /v1/documents` — List documents
- `GET /v1/documents/{id}` — Get document
- `PATCH /v1/documents/{id}` — Update document
- `DELETE /v1/documents/{id}` — Delete document

### Memories
- `POST /v1/memories` — Create memory directly
- `GET /v1/memories` — List memories
- `DELETE /v1/memories/{id}` — Forget a memory
- `PATCH /v1/memories/{id}` — Update a memory

### Search
- `POST /v1/search/memories` — Hybrid search (semantic + graph)
- `POST /v1/search/documents` — Document search

### Profile
- `POST /v1/profile` — Get user profile + optional search

### Health
- `GET /health` — Health check
- `GET /health/ready` — Readiness check

## License

MIT
