# Jetlag

Jetlag is split into an Angular frontend and a Spring Boot backend. The backend uses PostgreSQL and Springdoc to publish an OpenAPI document from its controllers; the Angular API client is generated from that live document.

## Run the full application

Requirements: Docker Desktop with Docker Compose.

```sh
docker compose up --build
```

Open [http://localhost:4200](http://localhost:4200). The map remains the main view; the greeting in its upper-left corner is fetched from the backend. Stop the application with `docker compose down`. PostgreSQL data is kept in the `postgres-data` volume.

The greeting endpoint is `GET /api/hello` and returns `Hello, world!`. The generated OpenAPI documentation is available at [http://localhost:4200/swagger-ui/index.html](http://localhost:4200/swagger-ui/index.html), with the JSON document at `/v3/api-docs`.

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

For local frontend development, run `npm start` and start the backend with `mvn -f backend/pom.xml spring-boot:run`. The Angular development server proxies `/api` to `localhost:8080`. Set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` if using a local PostgreSQL instance.