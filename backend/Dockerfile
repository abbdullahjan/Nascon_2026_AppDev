FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=5s --timeout=5s --retries=24 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Start the server
CMD ["node", "src/index.js"]
