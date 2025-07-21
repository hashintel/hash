import { registerOpenTelemetryTracing } from "@apps/hash-api/src/graphql/opentelemetry";

// Initialize OpenTelemetry for backend integration tests
const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;
if (otlpEndpoint) {
  registerOpenTelemetryTracing(otlpEndpoint, "BE Integration Tests");
}
