import {
  createUndiciInstrumentation,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";

const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;
if (otlpEndpoint) {
  registerOpenTelemetry({
    endpoint: otlpEndpoint,
    serviceName: "BE Integration Tests",
    instrumentations: [createUndiciInstrumentation()],
  });
}
