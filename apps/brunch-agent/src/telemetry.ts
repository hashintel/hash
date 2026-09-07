import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import {
  createHttpInstrumentation,
  createUndiciInstrumentation,
  type OpenTelemetrySetup,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";

type Environment = Readonly<Record<string, string | undefined>>;

interface TelemetryDependencies {
  readonly createFlueInstrumentation?: typeof createOpenTelemetryInstrumentation;
  readonly registerOpenTelemetry?: typeof registerOpenTelemetry;
}

/**
 * Register HASH's exporters before Flue obtains its tracer, meter, and logger
 * from the OpenTelemetry globals, so Flue's own spans and metrics leave the
 * process through the same providers.
 *
 * Disposal runs Flue first and the exporters last, so Flue's final spans are
 * flushed rather than dropped.
 */
export function createBrunchTelemetryInstrumentation(
  environment: Environment = process.env,
  dependencies: TelemetryDependencies = {},
) {
  const endpoint = environment.HASH_OTLP_ENDPOINT?.trim();
  if (environment.NODE_ENV === "production" && !endpoint) {
    throw new Error("Production telemetry requires HASH_OTLP_ENDPOINT.");
  }

  const register = dependencies.registerOpenTelemetry ?? registerOpenTelemetry;
  const setup: OpenTelemetrySetup | undefined = endpoint
    ? register({
        endpoint,
        serviceName: environment.OTEL_SERVICE_NAME?.trim() || "Brunch Agent",
        instrumentations: [
          createHttpInstrumentation(endpoint),
          createUndiciInstrumentation(),
        ],
      })
    : undefined;

  const createFlue =
    dependencies.createFlueInstrumentation ??
    createOpenTelemetryInstrumentation;
  const flueInstrumentation = createFlue({ content: false });

  return {
    key: flueInstrumentation.key,
    observe: flueInstrumentation.observe,
    interceptor: flueInstrumentation.interceptor,
    async dispose(): Promise<void> {
      flueInstrumentation.dispose();
      await setup?.shutdown();
    },
  };
}

export const installBrunchTelemetry = (): (() => Promise<void>) =>
  instrument(createBrunchTelemetryInstrumentation());

/** The machine-readable code Node, TLS, and `pg` attach to their errors, if any. */
export const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

const errorType = (error: unknown): string =>
  errorCode(error) ??
  (error instanceof Error ? error.constructor.name : typeof error);

/**
 * Record a content-free operational failure. The span carries the error's
 * code or class, never its message, so credentials and endpoints stay out of
 * telemetry.
 */
export async function recordOperationalFailure(
  stage: "database_configuration" | "database_operation",
  error: unknown,
): Promise<void> {
  const span = trace
    .getTracer("brunch-agent")
    .startSpan("brunch operational failure", {
      attributes: {
        "brunch.failure.stage": stage,
        "error.type": errorType(error),
      },
    });
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}
