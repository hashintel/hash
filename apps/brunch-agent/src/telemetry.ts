import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";

import {
  createHttpInstrumentation,
  createUndiciInstrumentation,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";

type Environment = Readonly<Record<string, string | undefined>>;

export interface BrunchOpenTelemetrySetup {
  readonly logger: ReturnType<typeof logs.getLogger>;
  readonly meter: ReturnType<typeof metrics.getMeter>;
  readonly shutdown: () => Promise<void>;
  readonly tracer: ReturnType<typeof trace.getTracer>;
}

interface TelemetryDependencies {
  readonly createFlueInstrumentation?: typeof createOpenTelemetryInstrumentation;
  readonly registerHashOpenTelemetry?: (input: {
    endpoint: string | undefined;
    serviceName: string;
  }) => BrunchOpenTelemetrySetup | undefined;
}

const registerHashOpenTelemetry = ({
  endpoint,
  serviceName,
}: {
  endpoint: string | undefined;
  serviceName: string;
}): BrunchOpenTelemetrySetup | undefined => {
  const sharedSetup = registerOpenTelemetry({
    endpoint,
    serviceName,
    instrumentations: endpoint
      ? [createHttpInstrumentation(endpoint), createUndiciInstrumentation()]
      : [],
  });
  if (!sharedSetup) return undefined;
  return {
    logger: logs.getLogger("brunch-agent"),
    meter: metrics.getMeter("brunch-agent"),
    shutdown: sharedSetup.shutdown,
    tracer: trace.getTracer("brunch-agent"),
  };
};

/**
 * Configure HASH exporters before Flue obtains its tracer and meter.
 *
 * The wrapper's asynchronous disposer lets the generated Flue server drain
 * active work, end Flue spans, and then flush application-owned exporters.
 */
export function createBrunchTelemetryInstrumentation(
  environment: Environment = process.env,
  dependencies: TelemetryDependencies = {},
) {
  const endpoint = environment.HASH_OTLP_ENDPOINT?.trim() || undefined;

  let setup: BrunchOpenTelemetrySetup | undefined;
  try {
    const register =
      dependencies.registerHashOpenTelemetry ?? registerHashOpenTelemetry;
    setup = register({
      endpoint,
      serviceName: environment.OTEL_SERVICE_NAME?.trim() || "Brunch Agent",
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      "OpenTelemetry setup failed; Brunch will continue without exporters.",
      error,
    );
  }

  const createFlue =
    dependencies.createFlueInstrumentation ??
    createOpenTelemetryInstrumentation;
  const flueInstrumentation = createFlue({
    content: false,
    ...(setup
      ? {
          logger: setup.logger,
          meter: setup.meter,
          tracer: setup.tracer,
        }
      : {}),
  });

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

const errorType = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/** Record a content-free operational failure. */
export function recordOperationalFailure(
  stage: "database_configuration" | "database_operation",
  error: unknown,
): void {
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
