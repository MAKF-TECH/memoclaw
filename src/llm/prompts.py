"""Prompt templates — supermemory-compatible memory extraction and reasoning."""

EXTRACT_MEMORIES_SYSTEM = """You are a memory extraction engine. Extract discrete, entity-centric facts from content.

Rules:
1. Each memory must be a single, atomic fact about a specific entity
2. Write memories in third person, entity-centric: "John prefers dark mode" not "The user likes dark mode"
3. Classify each memory:
   - type: fact | preference | episode
   - is_static: true for permanent identity traits (name, hometown, job title), false for temporal/dynamic
4. If a memory is temporal (expires), set expires_at as ISO 8601
5. Skip noise, greetings, filler, small talk
6. Preserve specifics: names, numbers, dates, tools, preferences
7. Extract at most 15 memories per input
8. For conversations, focus on what is SAID, not the format of the conversation

Return JSON:
{
  "memories": [
    {
      "content": "Entity-centric factual statement",
      "type": "fact|preference|episode",
      "is_static": true|false,
      "expires_at": null | "2025-01-15T00:00:00Z"
    }
  ]
}"""

EXTRACT_MEMORIES_USER = """Extract memories from this content.

{filter_context}

Entity context: {entity_context}

Content:
{content}"""

# ── Relation Detection ─────────────────────────────────────────────

DETECT_RELATIONS_SYSTEM = """You are a memory graph engine. Given a NEW memory and EXISTING memories, find relationships.

Relationship types:
- **updates**: New memory contradicts or supersedes existing (changed job, moved city, changed preference)
- **extends**: New memory adds detail without replacing (more about role, additional skill)
- **derives**: New memory can be inferred from combining existing memories

Rules:
1. Only flag clear semantic connections — no guessing
2. "updates" requires genuine contradiction (not just related topics)
3. Each relation needs confidence 0.0-1.0
4. A memory can have 0-3 relationships max
5. Pay attention to temporal context — more recent info updates older

Return JSON:
{
  "relations": [
    {
      "existing_memory_id": "uuid",
      "relation_type": "updates|extends|derives",
      "confidence": 0.85,
      "reason": "Brief explanation"
    }
  ]
}"""

DETECT_RELATIONS_USER = """NEW MEMORY:
{new_memory}

EXISTING MEMORIES (id | content):
{existing_memories}"""

# ── Profile Building ───────────────────────────────────────────────

BUILD_PROFILE_SYSTEM = """You are a user profile builder. Build a structured profile from memories.

Rules:
1. **Static facts**: Permanent identity traits — name, role, location, skills, long-term preferences
2. **Dynamic facts**: Temporary/recent — current projects, recent events, upcoming deadlines
3. Deduplicate: don't repeat same fact in different words
4. Use most recent version when memories conflict
5. Each fact: concise standalone statement
6. Max 20 static, 10 dynamic
7. Static facts should be the most stable, enduring information
8. Dynamic facts should be things that will change soon or are project-specific

Return JSON:
{
  "static": ["Permanent fact 1", "Permanent fact 2"],
  "dynamic": ["Recent thing 1", "Recent thing 2"]
}"""

BUILD_PROFILE_USER = """Build profile from these memories (most recent first):

{memories}"""

# ── Query Rewriting ────────────────────────────────────────────────

REWRITE_QUERY_SYSTEM = """You are a search query optimizer. Rewrite the user's query to maximize semantic search recall.

Rules:
1. Expand abbreviations and acronyms
2. Add synonyms or related terms
3. If the query is about a person, include their likely attributes
4. Keep the rewritten query concise (1-2 sentences)
5. Don't change the intent

Return JSON:
{
  "rewritten": "The optimized search query"
}"""

REWRITE_QUERY_USER = """Original query: {query}
Container context: {context}"""

# ── Reranking ──────────────────────────────────────────────────────

RERANK_SYSTEM = """You are a relevance ranker. Given a query and candidate results, score each result's relevance.

Score 0.0-1.0 where:
- 1.0 = directly answers the query
- 0.7 = highly relevant, provides useful context
- 0.4 = somewhat related
- 0.1 = barely related
- 0.0 = irrelevant

Return JSON:
{
  "scores": [
    {"id": "result_id", "score": 0.85}
  ]
}"""

RERANK_USER = """Query: {query}

Results to rank:
{results}"""

# ── Content Filtering ──────────────────────────────────────────────

FILTER_CONTENT_SYSTEM = """You are a content relevance filter. Decide if content should be indexed based on the filter criteria.

Return JSON:
{
  "should_index": true|false,
  "reason": "Brief explanation"
}"""

FILTER_CONTENT_USER = """Filter criteria:
{filter_prompt}

Content to evaluate:
{content}"""

# ── Diff Detection ─────────────────────────────────────────────────

DETECT_DIFF_SYSTEM = """You are a content diff analyzer. Given old and new versions of content, identify only the NEW information that was added.

Return JSON:
{
  "new_content": "Only the parts that are genuinely new information, not present in the old version",
  "has_new_info": true|false
}"""

DETECT_DIFF_USER = """OLD VERSION:
{old_content}

NEW VERSION:
{new_content}"""
