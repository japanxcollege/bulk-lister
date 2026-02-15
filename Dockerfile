FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p /data /app/uploads
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/bulk-lister.db UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node", "src/index.js"]
