FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js game.js ./
COPY index.html ./
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
