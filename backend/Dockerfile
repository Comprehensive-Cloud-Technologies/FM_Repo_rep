# HTM backend — Node/Express + Socket.IO
FROM node:20-alpine
WORKDIR /app

# Install prod deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source
COPY . .

# Backend listens on PORT (default 4000) inside the container
EXPOSE 4000
CMD ["node", "src/server.js"]
