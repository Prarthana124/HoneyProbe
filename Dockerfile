FROM node:20-bookworm-slim

ENV UV_PYTHON=3.13 \
    UV_PYTHON_INSTALL_DIR=/home/node/.local/share/uv/python \
    PYTHONUNBUFFERED=1 \
    COREPACK_HOME=/home/node/.cache/node/corepack \
    PATH="/home/node/.local/bin:${PATH}"

COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /uvx /usr/local/bin/

RUN corepack enable \
    && corepack prepare pnpm@10.26.1 --activate \
    && mkdir -p /app /data /home/node/.local/share/uv/python \
      /home/node/.cache/node/corepack \
    && chown -R node:node /app /data /home/node/.local /home/node/.cache

WORKDIR /app
COPY --chown=node:node . .

USER node

RUN uv python install 3.13 \
    && cd phases/phase1 \
    && pnpm install --frozen-lockfile \
    && cd ../phase4 \
    && pnpm install --frozen-lockfile \
    && uv sync --locked --project /app/phases/phase1 \
    && cd /app/phases/phase1 \
    && pnpm --filter @workspace/api-server run build \
    && cd /app/phases/phase4 \
    && PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 \
      pnpm --filter @workspace/security-console run build

ENV PORT=5000 \
    HONEYPROBE_GATEWAY_PORT=8080 \
    HONEYPROBE_INTERNAL_PORT=8180 \
    HONEYPROBE_ENV=development \
    HONEYPROBE_DB_PATH=/data/honeyprobe.sqlite3

EXPOSE 5000
VOLUME ["/data"]

CMD ["bash", "scripts/start-honeyprobe.sh"]
