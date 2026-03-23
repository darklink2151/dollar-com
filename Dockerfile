FROM node:20-alpine
WORKDIR /app
COPY . .
WORKDIR /app/backend
RUN npm install --production
EXPOSE 8080
ENV PORT=8080
CMD ["node", "src/server.js"]
