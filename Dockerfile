# ---------- Build stage ----------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:18-alpine

WORKDIR /app
ENV NODE_ENV=production
# Backend URL for API route proxies (override with -e if different)
ENV NEXT_PUBLIC_API_BASE_URL=http://15.206.213.150

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.js ./

EXPOSE 3000

CMD ["npm", "run", "start"]
