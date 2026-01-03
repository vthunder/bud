FROM oven/bun:1 AS base
WORKDIR /app

# Install Node.js (required for Claude CLI) and tmux (for Claude sessions)
RUN apt-get update && apt-get install -y curl tmux && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install Python and beads-mcp for beads MCP server
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install --break-system-packages beads-mcp && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user (Claude CLI blocks root for security)
RUN useradd -m -s /bin/bash bud && chown -R bud:bud /app
USER bud

# Set home directory for Claude CLI config
ENV HOME=/app
ENV PATH="/app/.local/bin:${PATH}"

# Install bd CLI for beads
RUN curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Set beads path to the installed binary
ENV BEADS_PATH=/app/.local/bin/bd
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
