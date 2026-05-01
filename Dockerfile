FROM node:24-bookworm-slim

# Outils minimaux + build-essential pour compiler les deps natives
# (better-sqlite3 d'Open Design passe par node-gyp qui requiert make/g++/python).
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

# Corepack + pnpm version pinned par le repo open-design
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# Claude Code CLI installé globalement (utilisé par Open Design pour générer)
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Cache layer : on copie d'abord les manifests pour profiter du cache Docker
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Puis tout le repo (les dossiers sources + skills + design-systems + templates)
COPY . .

# Install + build packages internes
RUN pnpm install --frozen-lockfile

# Build le daemon (artifact dist/cli.js utilisé par tools-dev)
RUN pnpm --filter @open-design/daemon build

# Volumes :
#   /root/.claude → OAuth Claude Code (login persisté)
#   /app/.od      → artefacts générés (maquettes HTML)
VOLUME ["/root/.claude", "/app/.od"]

# Le web (Next.js dev) tourne sur 50556. Le daemon Express reste sur 127.0.0.1:7457
# côté loopback (Open Design est local-first, le daemon ne s'expose pas).
EXPOSE 50556

# Healthcheck : on hit le web Next sur 127.0.0.1
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://127.0.0.1:50556 || exit 1

# Démarrage en foreground :
#   - daemon Express sur 7457 (loopback)
#   - Next dev sur 0.0.0.0:50556 (exposé via Traefik Coolify)
CMD ["pnpm", "tools-dev", "run", "web", \
     "--daemon-port", "7457", \
     "--web-port", "50556"]
