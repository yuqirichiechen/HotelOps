# Stage 1 — build the React frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY public/ public/
COPY src/ src/
# Relative URL so it works on any domain
ENV REACT_APP_API_URL=/api
RUN npm run build

# Stage 2 — run the Express server + serve the React build
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ .
COPY --from=frontend /app/build ./build
EXPOSE 8000
CMD ["node", "server.js"]
