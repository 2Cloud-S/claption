FROM node:24-bookworm AS deps

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python-is-python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json pyproject.toml ./
COPY python ./python
RUN npm ci
RUN pip install --break-system-packages -e .

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:24-bookworm AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PYTHONPATH=/app/python
ENV FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
ENV FIREWORKS_VISION_MODEL=accounts/fireworks/models/qwen3p7-plus
ENV FIREWORKS_TEXT_MODEL=accounts/fireworks/models/qwen3p7-plus
ENV FIREWORKS_JUDGE_MODEL=accounts/fireworks/models/kimi-k2p7-code
ENV CLAPTION_MAX_FRAMES=8
ENV CLAPTION_REPAIR_THRESHOLD=8.0
ENV CLAPTION_ENABLE_INTERNAL_JUDGE=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python-is-python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/python ./python
COPY --from=builder /app/pyproject.toml /app/next.config.ts /app/tokens.css /app/tsconfig.json ./
RUN pip install --break-system-packages -e .

EXPOSE 3000
CMD ["npm", "run", "start"]
