FROM oven/bun:1 AS base
WORKDIR /app

# Install Node.js (required for Claude CLI)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src ./src
COPY state ./state

# Run the bot
CMD ["bun", "run", "src/bot.ts"]
