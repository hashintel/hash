/**
 * Activity-side OpenTelemetry interceptors.
 *
 * Re-exports the upstream interceptors so workers reference the
 * `@local/hash-backend-utils/...` path consistently with the existing
 * Sentry interceptor wiring.
 *
 * Activity duration / outcome metrics (latency histograms, failed counts)
 * are emitted by Temporal's SDK runtime telemetry — see
 * `Runtime.install({ telemetryOptions })` in each worker's `main.ts`.
 * No custom metrics interceptor is needed.
 */
export {
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry";
