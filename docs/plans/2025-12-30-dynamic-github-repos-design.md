# Dynamic GitHub Repos Configuration Design

## Overview

Allow Bud to manage its GitHub repo watchlist through natural conversation, stored in a Letta memory block instead of an environment variable.

## Key Design Decisions

- **Letta memory block** - Store repo list in `github_repos` block
- **Natural conversation** - No special tools, Bud updates memory directly
- **Memory only** - No env var fallback, start empty and build through conversation

## How It Works

1. New Letta memory block `github_repos` stores JSON array: `["owner/repo1", "owner/repo2"]`
2. GitHub integration reads from this block instead of `GITHUB_REPOS` env var
3. You tell Bud "monitor vthunder/bud" → Bud updates its memory block
4. You tell Bud "stop monitoring vthunder/old-repo" → Bud removes it

## Example Conversation

```
You: Hey Bud, start monitoring the avail-project/avail-core repo
Bud: Got it, I'll keep an eye on avail-project/avail-core. I'm now monitoring:
  - vthunder/bud
  - avail-project/avail-core
```

## Memory Block

- **Label:** `github_repos`
- **Content:** JSON array `["owner/repo1", "owner/repo2"]`
- **Created via:** `scripts/add-github-repos-block.ts`

## Code Changes

### 1. Add repo loader function

**`src/integrations/github.ts`:**

```typescript
import type Letta from "@letta-ai/letta-client";
import { getMemoryBlock } from "../memory/letta";

export async function getMonitoredRepos(client: Letta, agentId: string): Promise<string[]> {
  const json = await getMemoryBlock(client, agentId, "github_repos");
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}
```

### 2. Update perch GitHub checker

**`src/perch/github.ts`:**

Change from using `config.github.repos` to calling `getMonitoredRepos()`.

### 3. Update config

**`src/config.ts`:**

Remove `repos` from github config (keep `token`):

```typescript
github: {
  token: process.env.GITHUB_TOKEN ?? "",
},
```

### 4. Create setup script

**`scripts/add-github-repos-block.ts`:**

Similar to `add-scheduled-tasks-block.ts`, creates the `github_repos` block with initial value `[]`.

### 5. Update Bud's awareness

Add to persona/system context so Bud knows it can manage repos:

```
You can manage which GitHub repos you monitor. When asked to monitor or stop monitoring a repo:
1. Read your current `github_repos` memory block
2. Add or remove the repo from the JSON array
3. Write the updated array back to the block
4. Confirm the change

Current format: ["owner/repo1", "owner/repo2"]
```

## Implementation Tasks

1. Create `scripts/add-github-repos-block.ts`
2. Add `getMonitoredRepos()` to `src/integrations/github.ts`
3. Update `src/perch/github.ts` to use dynamic repos
4. Remove `repos` from github config
5. Update Bud's persona with repo management instructions
6. Run setup script to create the block
7. Test the flow
