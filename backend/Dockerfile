# NaSCon '26 Backend API
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (keeps this layer cached unless package files change)
COPY package*.json ./
# npm install (not ci) because the committed lockfile omits dev-dependency
# entries; with --omit=dev we only install the locked production deps anyway.
RUN npm install --omit=dev --no-audit --no-fund

# Copy the rest of the source
COPY . .

# Guard against Windows CRLF line endings, then make the start script executable
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

# The API listens on 8080 (matches the competition requirement)
EXPOSE 8080

# /health must return 200 within 120s on a clean start (24 retries x 5s)
HEALTHCHECK --interval=5s --timeout=5s --retries=24 --start-period=30s \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Wait for Postgres, run migrations, then start the API
CMD ["./start.sh"]
