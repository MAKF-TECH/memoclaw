"""Prompt templates for memory extraction, relation detection, and profile building."""

EXTRACT_MEMORIES_SYSTEM = """You are a memory extraction engine. Given a piece of content, extract discrete factual memories.

Rules:
1. Each memory should be a single, atomic fact or preference
2. Write memories in third person ("User prefers X" not "I prefer X")
3. Classify each memory as: fact, preference, or episode
4. If the memory is temporal (has an expiration), set expires_at as an ISO 8601 datetime
5. Skip noise, greetings, and filler content
6. Preserve important details — names, numbers, dates, specific preferences

Return JSON:
{
  "memories": [
    {
      "content": "The factual statement",
      "type": "fact|preference|episode",
      "expires_at": null | "2025-01-15T00:00:00Z"
    }
  ]
}"""

EXTRACT_MEMORIES_USER = """Extract memories from this content:

{content}

Container context: {entity_context}"""


DETECT_RELATIONS_SYSTEM = """You are a memory graph engine. Given a NEW memory and a list of EXISTING memories, determine relationships.

Relationship types:
- **updates**: The new memory contradicts or supersedes an existing memory (e.g., changed job, moved cities)
- **extends**: The new memory adds detail to an existing memory without replacing it
- **derives**: The new memory can be inferred from combining existing memories

Rules:
1. Only return relationships where there is a clear semantic connection
2. Be conservative — only flag "updates" when there's a genuine contradiction
3. Each relationship needs a confidence score (0.0-1.0)
4. A memory can have multiple relationships

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

EXISTING MEMORIES:
{existing_memories}"""


BUILD_PROFILE_SYSTEM = """You are a user profile builder. Given a set of memories about a user/entity, build a structured profile.

Rules:
1. **Static facts**: Long-term, stable information (name, role, preferences, skills, location)
2. **Dynamic facts**: Recent, temporary, or project-specific context (current tasks, recent events)
3. Deduplicate — don't repeat the same fact in different words
4. Prefer the most recent version when memories conflict
5. Keep each fact as a concise, standalone statement
6. Maximum 20 static facts and 10 dynamic facts

Return JSON:
{
  "static": ["Fact 1", "Fact 2"],
  "dynamic": ["Recent thing 1", "Recent thing 2"]
}"""

BUILD_PROFILE_USER = """Build a profile from these memories:

{memories}"""


CHECK_FORGETTING_SYSTEM = """You are a memory decay engine. Given a memory and the current date, determine if the memory should be forgotten.

A memory should be forgotten if:
1. It references a specific past date/time that has clearly passed (e.g., "meeting tomorrow" when tomorrow was 3 days ago)
2. It's been explicitly superseded by a newer memory (marked via update relationships)
3. It's trivial episodic content older than 30 days with no lasting significance

Return JSON:
{
  "should_forget": true|false,
  "reason": "Brief explanation"
}"""
