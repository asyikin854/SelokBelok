# The server has no npm dependencies, so nothing needs installing.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server ./server
ENV PORT=3000 DATA_FILE=/data/reports.json
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
