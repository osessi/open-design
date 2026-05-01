FROM node:24-bookworm-slim

# Outils minimaux + build-essential pour compiler les deps natives
# (better-sqlite3 d'Open Design passe par node-gyp qui requiert make/g++/python).
# socat sert à exposer le Next dev (qui bind 127.0.0.1) vers 0.0.0.0 pour Traefik.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 build-essential socat \
    && rm -rf /var/lib/apt/lists/*

# Corepack + pnpm version pinned par le repo open-design
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# Claude Code CLI installé globalement (utilisé par Open Design pour générer).
# Le CLI refuse --dangerously-skip-permissions en root (qu'Open Design utilise),
# donc on créera un user non-root plus bas pour exécuter le daemon.
RUN npm install -g @anthropic-ai/claude-code

# User non-root "kodex" (uid 1100) — Claude Code accepte --dangerously-skip-permissions
# uniquement quand le process ne tourne PAS en root.
RUN useradd --create-home --uid 1100 --shell /bin/bash kodex

WORKDIR /app

# Cache layer : on copie d'abord les manifests pour profiter du cache Docker
COPY --chown=kodex:kodex package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Puis tout le repo (les dossiers sources + skills + design-systems + templates)
COPY --chown=kodex:kodex . .

# Install + build packages internes (en root pour avoir le cache pnpm global, puis chown)
RUN pnpm install --frozen-lockfile && \
    pnpm --filter @open-design/daemon build && \
    chown -R kodex:kodex /app

# Volumes :
#   /home/kodex/.claude → OAuth Claude Code (login persisté, dans le home du user)
#   /app/.od            → artefacts générés (maquettes HTML)
RUN mkdir -p /home/kodex/.claude /app/.od && \
    chown -R kodex:kodex /home/kodex /app/.od
VOLUME ["/home/kodex/.claude", "/app/.od"]

# On switch en user non-root pour le runtime
USER kodex
ENV HOME=/home/kodex

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
