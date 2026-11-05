# Jetlag

Jetlag is split into an Angular frontend and a Spring Boot backend. The backend uses PostgreSQL and Springdoc to publish an OpenAPI document from its controllers; the Angular API client is generated from that live document.

## Run the full application

Requirements: Docker Desktop with Docker Compose.

```sh
docker compose up --build
```

Open [http://localhost:4200/hideandseek/](http://localhost:4200/hideandseek/). The app and its API are served under `/hideandseek/` (the API at `/hideandseek/api/`); the bare address redirects there. The map remains the main view; the greeting in its upper-left corner is fetched from the backend. Stop the application with `docker compose down`. PostgreSQL data is kept in the `postgres-data` volume.

### Hosting on a server (HTTPS)

Browsers only allow GPS on HTTPS pages (and on `localhost`), so a hosted site must be served over HTTPS. The `proxy` service (Caddy, configured in `caddy/Caddyfile`) does this: point a domain name at the server, open ports 80 and 443, and start the stack with that domain:

```sh
SITE_ADDRESS=jetlag.example.com docker compose up --build -d
```

Caddy gets and renews a Let's Encrypt certificate on its own; the site is then at `https://jetlag.example.com/hideandseek/`. You can also put `SITE_ADDRESS=...` in a `.env` file next to `docker-compose.yml`.

### Installing the app and notifications

The production build is an installable web app with a service worker (`frontend/ngsw-config.json`), so players can add it to their home screen and get notifications for their games: a question waiting for the hiders, an answer for the seekers, the seekers setting off and the end. Each player turns them on in the game's Notifications section. On iPhone and iPad they only work in the app added to the Home Screen (iOS 16.4 or later). The development server (`npm start`) runs without the service worker; use `docker compose up` to try it.

The server makes its own VAPID key pair the first time it is needed and keeps it in the database. Set `PUSH_SUBJECT` to a `mailto:` or `https:` address where push services can reach whoever runs the server.

The greeting endpoint is `GET /hideandseek/api/hello` (`/api/hello` on the backend itself) and returns `Hello, world!`. The generated OpenAPI documentation is available at [http://localhost:4200/swagger-ui/index.html](http://localhost:4200/swagger-ui/index.html), with the JSON document at `/v3/api-docs`.

## Generate API code

Install dependencies from the repository root, ensure Java and Maven are available, and start the backend so Springdoc can expose its generated API document:

```sh
npm ci
mvn -f backend/pom.xml spring-boot:run
```

In another terminal, generate the Angular client from the running backend:

```sh
npm run api:generate
```

The Angular workspace lives in `frontend/`. Root npm scripts forward to that workspace, so `npm start`, `npm run build`, and `npm test` remain available from the repository root. The frontend client is generated under `frontend/src/app/api/generated` from the Springdoc document at `http://localhost:8080/v3/api-docs`. The Spring controllers themselves are the backend implementation; no separate generated server interface is needed.

For local frontend development, run `npm start` and start the backend with `mvn -f backend/pom.xml spring-boot:run`. The Angular development server serves the app at the root and proxies `/api` to `localhost:8080`; only the production build (`baseHref` in `angular.json`) is under `/hideandseek/`, the path `frontend/nginx.conf` serves it from. Set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` if using a local PostgreSQL instance.