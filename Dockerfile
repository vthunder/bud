FROM oven/bun:1 AS base
WORKDIR /app

# Install Node.js (required for Claude CLI)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI and tsx globally
RUN npm install -g @anthropic-ai/claude-code tsx

# Create home directory for Claude CLI config
ENV HOME=/app
RUN mkdir -p /app/.claude

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src ./src
COPY state ./state

# Run the bot with tsx (SDK uses child_process which has issues in Bun)
CMD ["tsx", "src/bot.ts"]
