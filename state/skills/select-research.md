# Select Research

Skill for selecting research tasks from a project.

## When to Use

Called by `select-work` when a project's goals involve research, learning, or exploration.

## Indicators

A goal is research-oriented if it mentions:
- "research", "investigate", "explore", "learn"
- "understand", "analyze", "compare"
- "read", "review", "study"
- References to papers, docs, articles

## Process

1. **Identify research goals**: Find active goals with research indicators
2. **Check progress**: Look at notes.md for existing findings
3. **Determine next step**:
   - If no sources gathered: Find and list sources
   - If sources exist but not reviewed: Review next source
   - If reviewed but not synthesized: Write synthesis
   - If synthesized: Check if questions answered, or identify follow-ups
4. **Return work item**: Specific next research action

## Output

```
Research goal: "Understand hierarchical memory approaches"

Progress:
- Sources: 3 papers identified, 1 reviewed
- Findings: Initial notes on sliding window approach

Next step: Review paper #2 "Retrieval-Augmented Generation"
Estimated cost: $0.30 (reading + notes)
```

## Research Cycle

```
┌─────────────┐
│ Identify    │
│ Questions   │
└──────┬──────┘
       ▼
┌─────────────┐
│ Gather      │
│ Sources     │
└──────┬──────┘
       ▼
┌─────────────┐
│ Review      │
│ Sources     │
└──────┬──────┘
       ▼
┌─────────────┐
│ Synthesize  │
│ Findings    │
└──────┬──────┘
       ▼
┌─────────────┐
│ Answer or   │
│ New Questions│
└─────────────┘
```
