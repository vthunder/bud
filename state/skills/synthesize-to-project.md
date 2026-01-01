# Synthesize to Project

Extract insights from conversation and save to project files.

## When to Use

- User invokes `/synthesize-to-project <project-name>`
- After a substantive discussion about a project
- When user says "save this to the project notes"

## Process

1. **Identify scope**: Look backward through conversation to find relevant content
   - Stop at: previous `/synthesize`, topic change, session start, or ~50 messages
   - Include: decisions, insights, requirements, design discussions
2. **Extract insights**:
   - Key decisions made
   - New requirements or constraints
   - Design choices and rationale
   - Open questions
   - Action items
3. **Categorize**:
   - Notes (general insights) → append to notes.md
   - Goals (action items) → suggest additions to goals.md
   - Links (resources mentioned) → add to links.md
4. **Write to files**: Append to appropriate project files
5. **Confirm**: Show what was extracted and where it was saved

## Scope Detection

The skill automatically determines how far back to look:

```
Looking for conversation scope...
- Found topic shift at message 12 (switched from browserid to scheduling)
- Extracting from messages 1-12

Extracted:
- 3 design decisions
- 1 new requirement
- 2 open questions
```

## Output Format

```
## Synthesized from conversation

### Decisions
- Use popup for IdP auth instead of redirect (resilience)
- 2-minute timeout for auth attempts

### New Requirements
- Dialog must handle popup blockers gracefully

### Open Questions
- Should we retry on timeout automatically?

Saved to: browserid-ng/notes.md
Suggested goal update: "Add popup blocker handling" (Priority 2)
```

## No Manual Markers Needed

The skill should figure out scope from context. It looks for:
- Explicit project mentions
- Topic continuity
- Natural conversation boundaries
- Time gaps between messages
