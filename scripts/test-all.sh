#!/bin/bash
# Run tests in groups to avoid mock.module conflicts

set -e

# Tests with mocks (run separately to avoid polluting other tests)
echo "=== Running tests with mocks ==="
~/.bun/bin/bun test --no-cache \
  tests/perch/context.test.ts \
  tests/perch/decide.test.ts \
  tests/tools/tasks.test.ts

# Core memory tests (no mocks)
# Run with max-concurrency=1 because memory/blocks.ts and memory/journal.ts
# use global module-level state (db, journalPath) that gets stomped on
# when test files run in parallel
echo "=== Running core tests ==="
~/.bun/bin/bun test --no-cache --max-concurrency=1 \
  tests/memory/ \
  tests/state.test.ts \
  tests/budget.test.ts \
  tests/config.test.ts

# Projects tests (also use memory/blocks.ts singleton)
echo "=== Running projects tests ==="
~/.bun/bin/bun test --no-cache --max-concurrency=1 \
  tests/projects/ \
  tests/tools/projects.test.ts \
  tests/integration/

# Integration tests
echo "=== Running integration tests ==="
~/.bun/bin/bun test --no-cache \
  tests/integrations/ \
  tests/skills.test.ts \
  tests/prompt.test.ts \
  tests/discord/ \
  tests/perch/tasks.test.ts \
  tests/perch/calendar.test.ts \
  tests/perch/github.test.ts

echo "=== All tests passed ==="
