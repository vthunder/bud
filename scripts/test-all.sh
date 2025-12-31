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
echo "=== Running core tests ==="
~/.bun/bin/bun test --no-cache \
  tests/memory/ \
  tests/state.test.ts \
  tests/budget.test.ts

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
