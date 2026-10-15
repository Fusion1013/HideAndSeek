FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend frontend
RUN npm run build --workspace=jetlag-web

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/dist/jetlag-web/browser /usr/share/nginx/html
EXPOSE 80