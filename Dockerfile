FROM node:18-alpine

WORKDIR /app

# Install bash for devcontainer features
RUN apk add --no-cache bash

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create public directory if it doesn't exist
RUN mkdir -p public

# Expose port
EXPOSE 8003

# Run the application
CMD ["npm", "start"]
