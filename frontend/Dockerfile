# HTM frontend — Vite build served by nginx
# VITE_MODE selects which .env.<mode> file to build with (develop | testing | production)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
ARG VITE_MODE=production
RUN npm run build -- --mode ${VITE_MODE}

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine runs envsubst over templates at startup; BACKEND_HOST/BACKEND_PORT
# are injected per-service by docker-compose so each frontend talks to its backend.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
