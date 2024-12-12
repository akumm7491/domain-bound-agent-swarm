# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./
COPY package-lock.json ./

# Install all dependencies including devDependencies
RUN HUSKY=0 npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install curl for health check
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY package-lock.json ./

# Install production dependencies only
RUN HUSKY=0 npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy environment file template
COPY .env.example .env

# Create volume mount points
VOLUME ["/app/logs", "/app/data"]

# Expose ports
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HUSKY=0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/server.js"] 