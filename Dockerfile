FROM oven/bun:1.3-alpine AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
ENV NODE_ENV=production
COPY . .
RUN bun build src --compile --outfile /app/docker-hosts

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=builder /app/docker-hosts /app/docker-hosts
CMD ["/app/docker-hosts"]
