FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY pom.xml .
COPY docker/mvn-with-retry.sh /usr/local/bin/mvn-with-retry
# Reuse downloaded dependencies and retry transient repository failures only.
RUN --mount=type=cache,id=wealthmaster-maven,target=/root/.m2,sharing=locked \
    sh /usr/local/bin/mvn-with-retry -q -DskipTests dependency:go-offline
COPY src ./src
RUN --mount=type=cache,id=wealthmaster-maven,target=/root/.m2,sharing=locked \
    sh /usr/local/bin/mvn-with-retry -q -DskipTests package

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 appuser
COPY --from=build /workspace/target/*.jar app.jar
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
