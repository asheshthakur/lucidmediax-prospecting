# Production Dockerfile for LucidMediax Client Acquisition Engine
FROM node:22-bullseye-slim

# Install system tools needed for native sqlite compilation and secure requests
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create data directory and declare persistent volume
RUN mkdir -p /app/data /app/data/backups
VOLUME ["/app/data"]

# Default environment configuration
ENV NODE_ENV=production
ENV PORT=3500

EXPOSE 3500

# Launch server
CMD ["npm", "start"]
