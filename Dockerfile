FROM node:24-bookworm-slim

# Outils minimaux + build-essential pour compiler les deps natives
# (better-sqlite3 d'Open Design passe par node-gyp qui requiert make/g++/python).
# socat sert à exposer le Next dev (qui bind 127.0.0.1) vers 0.0.0.0 pour Traefik.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 build-essential socat \
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

# Open Design est local-first : le daemon (7457) ET le web (50556) bindent
# tous les deux sur 127.0.0.1. Pour qu'un reverse-proxy externe (Traefik
# Coolify) puisse les joindre, on expose 0.0.0.0:8080 et on fait un pont
# socat → 127.0.0.1:50556. Coolify route design.kodex.digital vers le
# port 8080 du container.
EXPOSE 8080

# Healthcheck : on hit le port public exposé via socat
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080 || exit 1

# Démarrage : socat en background pour relayer 0.0.0.0:8080 vers 127.0.0.1:50556,
# puis tools-dev run web en foreground.
CMD ["bash", "-c", "socat TCP-LISTEN:8080,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:50556 & exec pnpm tools-dev run web --daemon-port 7457 --web-port 50556"]
