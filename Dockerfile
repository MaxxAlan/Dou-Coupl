# Use light official node image
FROM node:20-slim

WORKDIR /app

# Copy package config
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built code and default seeded files
COPY dist ./dist
COPY db.json* ./

# Expose server port (Cloud Run will inject PORT env dynamically)
EXPOSE 3000

ENV NODE_ENV=production

# Start production server
CMD ["npm", "start"]
