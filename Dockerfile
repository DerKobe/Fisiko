# Produktions-Image. Liegt ein Dockerfile im Repo, baut Dokku damit statt mit Herokuish/Buildpacks.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Abhängigkeiten zuerst (besseres Layer-Caching); three.js, cannon-es und die
# Weltkarten-Daten werden zur Laufzeit aus node_modules ausgeliefert.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public

USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
