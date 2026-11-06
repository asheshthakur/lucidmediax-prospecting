# Production Dockerfile for LucidMediax Client Acquisition Engine
FROM node:22-slim

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source
COPY . .

# Default environment configuration
ENV NODE_ENV=production
ENV PORT=3500

EXPOSE 3500

# Launch server directly
CMD ["node", "server/index.js"]
