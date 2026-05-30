FROM node:24-trixie-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm test \
  && npm run ui:build \
  && curl -fsSL https://withcoral.com/install.sh | sh

ENV NODE_ENV=production
ENV PATH="/root/.local/bin:${PATH}"
ENV TRACEBULLET_APP_HOST=0.0.0.0
ENV TRACEBULLET_CORAL_QUERY_COMMAND=node
ENV TRACEBULLET_CORAL_QUERY_ARGS=scripts/run-coral-sql.mjs

EXPOSE 10000

CMD ["npm", "run", "render:start"]
