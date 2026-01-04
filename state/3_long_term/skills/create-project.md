# Create Project

Skill for setting up a new project.

## When to Use

- User says "let's start a new project for X"
- User invokes `/create-project <name>`

## Process

1. **Gather info**:
   - Project name (kebab-case)
   - Brief description
   - Initial goals (optional)
   - Links to repos, resources (optional)
2. **Create directory**: `{projects_path}/{name}/`
3. **Create files**:
   - `notes.md` - Initial notes with description
   - `goals.md` - Initial goals (or empty template)
   - `links.md` - Any linked resources
4. **Offer to add to focus**: Ask if this should be a focused project

## Directory Structure

```
{projects_path}/{name}/
├── notes.md      # Project notes and context
├── goals.md      # Goals in markdown format
├── links.md      # Links to repos, beads, docs
└── log.md        # Activity log (created on first entry)
```

## Example Interaction

```
User: Let's create a project for the bud scheduler redesign

Bud: I'll create a new project. Let me gather some details:

**Name:** bud-scheduler-redesign
**Description:** Redesign the perch scheduler to use skill-based work selection

Any initial goals?

User: Yes - implement focus-based selection, add project-review skill

Bud: Created project at ~/.bud/projects/bud-scheduler-redesign/
- notes.md with description
- goals.md with 2 initial goals
- links.md (empty, add repos/resources later)

Add to focus? Currently 1/3 slots used.
```
