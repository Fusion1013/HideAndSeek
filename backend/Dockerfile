FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace/backend
COPY backend/pom.xml ./pom.xml
COPY api ../api
RUN mvn -B -DskipTests dependency:go-offline
COPY backend/src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /workspace/backend/target/jetlag-backend-1.0.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]