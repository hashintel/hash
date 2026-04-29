/**
 * OpenTelemetry registration for HASH Node services.
 *
 * Registers a global trace, log, and metric provider against an OTLP/gRPC
 * collector when `endpoint` is set, plus any caller-supplied auto
 * instrumentations (HTTP, Express, gRPC, …).
 *
 * Returns a teardown function that must run during graceful shutdown so
 * pending spans / log records / metric points are flushed before exit.
 */
import { metrics } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import type { Resource } from "@opentelemetry/resources";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const traceTimeoutMs = 5000;
const metricExportIntervalMs = 30_000;

export interface RegisterOpenTelemetryOptions {
  /**
   * OTLP gRPC endpoint, e.g. `http://localhost:4317`. Falsy values disable
   * registration entirely (useful for local development without a
   * collector running).
   */
  endpoint: string | null | undefined;
  /** `service.name` resource attribute. */
  serviceName: string;
  /** Auto-instrumentations to register (HTTP, gRPC, Express, …). */
  instrumentations?: Instrumentation[];
}

export interface OpenTelemetrySetup {
  /** Run during graceful shutdown to flush pending spans / logs / metrics. */
  shutdown: () => Promise<void>;
  /**
   * The trace exporter, exposed so callers can build worker-side sinks
   * (e.g. Temporal's `makeWorkflowExporter`) that share this connection.
   */
  traceExporter: SpanExporter;
  /** The resource used for traces / logs / metrics, shared with sinks. */
  resource: Resource;
}

/**
 * Mapping of outbound `host` → `peer.service` label used by Tempo's
 * `service_graphs` processor to render external dependencies as
 * separate nodes in the service map. Without this attribute the
 * undici-instrumentation spans land under the caller service ("AI
 * Worker") with a bare `POST` name and no external-service edge.
 *
 * Keys are matched as exact host or as suffix (`.openai.com` matches
 * `api.openai.com`).
 */
const PEER_SERVICE_BY_HOST: Array<[string, string]> = [
  ["api.openai.com", "OpenAI"],
  ["api.anthropic.com", "Anthropic"],
  ["api.linear.app", "Linear"],
  [".googleapis.com", "Google Cloud"],
  ["edge-config.vercel.com", "Vercel Edge Config"],
  [".vercel.com", "Vercel"],
];

const resolvePeerService = (host: string): string | undefined => {
  for (const [match, service] of PEER_SERVICE_BY_HOST) {
    if (match.startsWith(".") ? host.endsWith(match) : host === match) {
      return service;
    }
  }
  return undefined;
};

/**
 * `@opentelemetry/instrumentation-undici` instance configured with:
 *
 * - `peer.service` derived from the outbound host (Tempo's
 *   `service_graphs` processor turns this into an external-service
 *   edge in the service map).
 * - Span name set to `METHOD host/path` rather than the bare HTTP
 *   verb the instrumentation defaults to.
 */
export const createUndiciInstrumentation = (): UndiciInstrumentation =>
  new UndiciInstrumentation({
    startSpanHook: (request) => {
      try {
        const { host } = new URL(request.origin);
        const peerService = resolvePeerService(host);
        return peerService ? { "peer.service": peerService } : {};
      } catch {
        return {};
      }
    },
    requestHook: (span, request) => {
      // Default span name is just `POST` — replace with `METHOD path`
      // so outbound calls are distinguishable in Tempo. The host is
      // covered by `peer.service` (set in `startSpanHook`), so the
      // span name only carries the path. Strip query string to keep
      // cardinality bounded.
      const path = request.path.split("?")[0];
      span.updateName(`${request.method} ${path}`);
    },
  });

/**
 * Last setup returned from `registerOpenTelemetry`. Exposed so callers
 * that bootstrap OTEL via a `--import` shim (where the setup handle
 * isn't naturally accessible from the main entry point) can still wire
 * `shutdown()` into their graceful-shutdown chain.
 */
let activeSetup: OpenTelemetrySetup | undefined;

/**
 * Returns the most recently registered OTEL setup, if any.
 */
export const getActiveOpenTelemetrySetup = (): OpenTelemetrySetup | undefined =>
  activeSetup;

/**
 * Initialise tracing, logging, and metrics. Returns `undefined` when
 * `endpoint` is unset so callers can skip workflow-side sink wiring.
 */
export const registerOpenTelemetry = ({
  endpoint,
  serviceName,
  instrumentations = [],
}: RegisterOpenTelemetryOptions): OpenTelemetrySetup | undefined => {
  if (!endpoint) {
    // This runs before any logger is wired up, so direct stderr is the
    // right channel — and it's a one-shot bootstrap message, not a hot
    // log path.
    // eslint-disable-next-line no-console
    console.warn(
      "No OpenTelemetry Protocol endpoint given. Not sending telemetry anywhere.",
    );
    return undefined;
  }

  const collectorOptions = {
    timeoutMillis: traceTimeoutMs,
    url: endpoint,
  };

  const resource = defaultResource().merge(
    resourceFromAttributes({ "service.name": serviceName }),
  );

  // Tracing
  const traceExporter = new OTLPTraceExporter(collectorOptions);
  const traceProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(traceExporter)],
  });
  traceProvider.register();

  // Logs
  const logExporter = new OTLPLogExporter(collectorOptions);
  const logProvider = new LoggerProvider({
    resource,
    processors: [new SimpleLogRecordProcessor(logExporter)],
  });
  logs.setGlobalLoggerProvider(logProvider);

  // Metrics
  const metricExporter = new OTLPMetricExporter(collectorOptions);
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: metricExportIntervalMs,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const unregisterInstrumentations = registerInstrumentations({
    instrumentations,
  });

  // eslint-disable-next-line no-console
  console.info(
    `Registered OpenTelemetry (traces + logs + metrics) at endpoint ${endpoint} for ${serviceName}`,
  );

  const setup: OpenTelemetrySetup = {
    traceExporter,
    resource,
    shutdown: async () => {
      await Promise.allSettled([
        traceProvider.shutdown(),
        logProvider.shutdown(),
        meterProvider.shutdown(),
      ]);
      unregisterInstrumentations();
    },
  };
  activeSetup = setup;
  return setup;
};
