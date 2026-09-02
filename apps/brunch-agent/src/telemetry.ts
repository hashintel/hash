import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import {
  defaultResource,
  envDetector,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import type { Attributes } from "@opentelemetry/api";

type Environment = Readonly<Record<string, string | undefined>>;

export interface BrunchOpenTelemetrySetup {
  readonly forceFlush: () => Promise<void>;
  readonly logger: ReturnType<LoggerProvider["getLogger"]>;
  readonly meter: ReturnType<MeterProvider["getMeter"]>;
  readonly shutdown: () => Promise<void>;
  readonly tracer: ReturnType<NodeTracerProvider["getTracer"]>;
}

let activeSetup: BrunchOpenTelemetrySetup | undefined;

interface TelemetryDependencies {
  readonly createFlueInstrumentation?: typeof createOpenTelemetryInstrumentation;
  readonly registerHashOpenTelemetry?: (input: {
    endpoint: string;
    serviceName: string;
  }) => BrunchOpenTelemetrySetup;
}

const DEFAULT_OTLP_PORT = 4317;
const HEALTH_PATH = "/health";

const otlpPortFromEndpoint = (endpoint: string): number => {
  try {
    const { port } = new URL(endpoint);
    return port ? Number.parseInt(port, 10) : DEFAULT_OTLP_PORT;
  } catch {
    return DEFAULT_OTLP_PORT;
  }
};

export const createBrunchHttpInstrumentation = (
  endpoint: string,
): HttpInstrumentation => {
  const otlpPort = otlpPortFromEndpoint(endpoint);
  return new HttpInstrumentation({
    ignoreIncomingRequestHook: (request) =>
      request.url?.split("?")[0] === HEALTH_PATH,
    ignoreOutgoingRequestHook: (options) => Number(options.port) === otlpPort,
  });
};

export const createBrunchUndiciInstrumentation = (
  endpoint: string,
): UndiciInstrumentation => {
  const otlpPort = otlpPortFromEndpoint(endpoint);
  return new UndiciInstrumentation({
    ignoreRequestHook: (request) => {
      try {
        const { port, protocol } = new URL(request.origin);
        const requestPort = port
          ? Number.parseInt(port, 10)
          : protocol === "https:"
            ? 443
            : 80;
        return requestPort === otlpPort;
      } catch {
        return false;
      }
    },
  });
};

const registerHashOpenTelemetry = ({
  endpoint,
  serviceName,
}: {
  endpoint: string;
  serviceName: string;
}): BrunchOpenTelemetrySetup => {
  const exporterOptions = { timeoutMillis: 5000, url: endpoint };
  const environmentAttributes = envDetector.detect().attributes ?? {};
  const resource = defaultResource()
    .merge(resourceFromAttributes(environmentAttributes as Attributes))
    .merge(resourceFromAttributes({ "service.name": serviceName }));
  const traceProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter(exporterOptions)),
    ],
  });
  traceProvider.register();

  const logProvider = new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter(exporterOptions),
      }),
    ],
    resource,
  });
  logs.setGlobalLoggerProvider(logProvider);

  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(exporterOptions),
        exportIntervalMillis: 30_000,
      }),
    ],
    resource,
  });
  const unregisterInstrumentations = registerInstrumentations({
    instrumentations: [
      createBrunchHttpInstrumentation(endpoint),
      createBrunchUndiciInstrumentation(endpoint),
    ],
    meterProvider,
    tracerProvider: traceProvider,
  });

  return {
    forceFlush: async () => {
      await Promise.all([
        traceProvider.forceFlush(),
        logProvider.forceFlush(),
        meterProvider.forceFlush(),
      ]);
    },
    logger: logProvider.getLogger("brunch-agent"),
    meter: meterProvider.getMeter("brunch-agent"),
    shutdown: async () => {
      unregisterInstrumentations();
      const results = await Promise.allSettled([
        traceProvider.shutdown(),
        logProvider.shutdown(),
        meterProvider.shutdown(),
      ]);
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason as unknown] : [],
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          "One or more Brunch OpenTelemetry providers failed to shut down.",
        );
      }
    },
    tracer: traceProvider.getTracer("brunch-agent"),
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
  const endpoint = environment.HASH_OTLP_ENDPOINT?.trim();
  if (
    environment.NODE_ENV === "production" &&
    (endpoint === undefined || endpoint.trim().length === 0)
  ) {
    throw new Error("Production telemetry requires HASH_OTLP_ENDPOINT.");
  }

  let setup: BrunchOpenTelemetrySetup | undefined;
  if (endpoint) {
    const register =
      dependencies.registerHashOpenTelemetry ?? registerHashOpenTelemetry;
    setup = register({
      endpoint,
      serviceName: environment.OTEL_SERVICE_NAME?.trim() || "Brunch Agent",
    });
    activeSetup = setup;
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
      try {
        await setup?.shutdown();
      } finally {
        if (activeSetup === setup) activeSetup = undefined;
      }
    },
  };
}

export const installBrunchTelemetry = (): (() => Promise<void>) =>
  instrument(createBrunchTelemetryInstrumentation());

const errorType = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/** Record a content-free operational failure, flushing only before startup aborts. */
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
  if (stage === "database_configuration") {
    await activeSetup?.forceFlush();
  }
}
