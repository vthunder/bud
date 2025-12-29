FROM oven/bun:1 AS base
WORKDIR /app

# Install Node.js (required for Claude CLI)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user (Claude CLI blocks root for security)
RUN useradd -m -s /bin/bash bud && chown -R bud:bud /app
USER bud

# Set home directory for Claude CLI config
ENV HOME=/app
RUN mkdir -p /app/.claude

# Install dependencies
COPY --chown=bud:bud package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY --chown=bud:bud src ./src
COPY --chown=bud:bud state ./state
COPY --chown=bud:bud scripts ./scripts

# Copy cron configuration
COPY --chown=bud:bud cron.d ./cron.d
RUN chmod +x ./scripts/run-perch.sh

# Run the bot
CMD ["bun", "run", "src/bot.ts"]
