---
name: memoclaw
slug: memoclaw
version: 1.0.0
description: Persistent memory for AI agents via MemoClaw — store, search, and recall memories across conversations. Auto-extracts facts, builds user profiles, and handles knowledge updates.
metadata:
  clawdbot:
    emoji: "🧠"
    requires:
      bins: []
    os: ["linux", "darwin", "win32"]
---

## When to Use

Use this skill when:
- The agent needs to **remember** something across conversations
- The agent needs to **recall** past context, facts, or preferences
- The user says "remember this", "what do you know about me", or similar
- You need to **build context** at the start of a conversation (user profile)
- You want to **forget** or update stored information

Do NOT use for: ephemeral in-session memory (use workspace files), file storage, or real-time data.

## Configuration

The MemoClaw API runs as a Docker container on the same network. Set these in your environment or workspace:

| Variable | Description |
|---|---|
| `MEMOCLAW_URL` | Base URL (default: `http://memoclaw:8420`) |
| `MEMOCLAW_API_KEY` | Bearer token for API auth |

If not set, defaults to `http://memoclaw:8420` with key `mc-changeme`.

## How It Works

MemoClaw stores memories in a knowledge graph with three relationship types:
- **Updates**: new info supersedes old (e.g., changed job)
- **Extends**: new info adds detail to existing (e.g., more about their role)
- **Derives**: inferred connections between facts

Memories are scoped by **container tags** — use these to separate per-user or per-project context.

## Core Operations

### 1. Save a memory (via document ingestion)

The LLM auto-extracts atomic facts from the content.

```bash
curl -X POST "${MEMOCLAW_URL:-http://memoclaw:8420}/v1/documents" \
  -H "Authorization: Bearer ${MEMOCLAW_API_KEY:-mc-changeme}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User said: I just moved to Paris and started working at Datadog as a senior SRE. I prefer dark mode and vim.",
    "containerTag": "USER_ID_HERE"
  }'
```

### 2. Save a memory directly (no extraction)

```bash
curl -X POST "${MEMOCLAW_URL:-http://memoclaw:8420}/v1/memories" \
  -H "Authorization: Bearer ${MEMOCLAW_API_KEY:-mc-changeme}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User prefers concise answers with code examples",
    "containerTag": "USER_ID_HERE",
    "type": "preference"
  }'
```

### 3. Search memories (recall)

```bash
curl -X POST "${MEMOCLAW_URL:-http://memoclaw:8420}/v1/search/memories" \
  -H "Authorization: Bearer ${MEMOCLAW_API_KEY:-mc-changeme}" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "where does the user work?",
    "containerTag": "USER_ID_HERE",
    "limit": 5
  }'
```

### 4. Get user profile (best for conversation start)

Returns static facts + dynamic context in one call. Inject into system prompt.

```bash
curl -X POST "${MEMOCLAW_URL:-http://memoclaw:8420}/v1/profile" \
  -H "Authorization: Bearer ${MEMOCLAW_API_KEY:-mc-changeme}" \
  -H "Content-Type: application/json" \
  -d '{
    "containerTag": "USER_ID_HERE",
    "q": "optional search query"
  }'
```

Response:
```json
{
  "profile": {
    "static": ["Lives in Paris", "Works at Datadog as senior SRE", "Prefers vim and dark mode"],
    "dynamic": ["Recently moved to Paris", "Starting new job"]
  },
  "searchResults": { "results": [...] }
}
```

### 5. Forget a memory

```bash
curl -X DELETE "${MEMOCLAW_URL:-http://memoclaw:8420}/v1/memories/{memory_id}" \
  -H "Authorization: Bearer ${MEMOCLAW_API_KEY:-mc-changeme}"
```

## Agent Integration Pattern

At the **start of each conversation**, load context:

```
1. Call POST /v1/profile with containerTag = user identifier
2. Inject profile.static + profile.dynamic into system prompt
3. If the user asks something specific, call POST /v1/search/memories
```

During conversation, **save important info**:

```
1. When the user shares a fact/preference → POST /v1/documents with the conversation snippet
2. MemoClaw auto-extracts memories, handles contradictions, builds the graph
```

## Container Tag Strategy

Use container tags to scope memories:

| Pattern | Example | Use case |
|---|---|---|
| User ID | `user_makf` | Per-user memory |
| Project | `project_memoclaw` | Per-project context |
| User + Project | `makf_memoclaw` | Scoped to both |
| Agent | `agent_atlas` | Agent's own memory |

## Memory Types

| Type | Description | Example |
|---|---|---|
| `fact` | Stable information | "User is a DevOps engineer" |
| `preference` | User preferences | "Prefers TypeScript over JavaScript" |
| `episode` | Time-bound events | "Had a meeting about migration today" |
