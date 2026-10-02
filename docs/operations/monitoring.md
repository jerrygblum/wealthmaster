# Monitoring

Initial monitoring is intentionally simple:
- Spring Boot Actuator health endpoint
- Container health checks
- Structured backend logs
- Docker/Synology resource visibility

Later, add metrics/error reporting only when they solve a concrete operational need.

Do not log sensitive financial document contents or secrets.
