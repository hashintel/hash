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
import { metrics, SpanStatusCode } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {
  HttpInstrumentation,
  type HttpInstrumentationConfig,
} from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import {
  defaultResource,
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

import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { Resource } from "@opentelemetry/resources";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { IncomingMessage, ServerResponse } from "node:http";

const traceTimeoutMs = 5000;
const metricExportIntervalMs = 30_000;
const shutdownTimeoutMs = 2000;

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
  /** OTLP gRPC endpoint this setup is attached to. */
  endpoint: string;
  /** Run during graceful shutdown to flush pending spans / logs / metrics. */
  shutdown: () => Promise<void>;
  /**
   * The trace exporter, exposed so callers can build worker-side sinks
   * (e.g. a span processor feeding Temporal's `makeWorkflowExporter`)
   * that share this connection.
   */
  traceExporter: SpanExporter;
  /** The resource used for traces / logs / metrics, shared with sinks. */
  resource: Resource;
}

/**
 * Mapping of outbound `host` → `peer.service` label used by Tempo's
 * `service_graphs` processor to render external dependencies as
 * separate nodes in the service map.
 *
 * Order matters: the first match wins, so place narrower exact matches
 * before broader suffix matches. `kind: "suffix"` matches against the
 * tail of the host (e.g. `.googleapis.com` matches `bigquery.googleapis.com`
 * but not the bare `googleapis.com`).
 */
type PeerServiceRule =
  | { kind: "exact"; host: string; service: string }
  | { kind: "suffix"; suffix: string; service: string };

const PEER_SERVICE_RULES: readonly PeerServiceRule[] = [
  { kind: "exact", host: "api.openai.com", service: "OpenAI" },
  { kind: "exact", host: "api.anthropic.com", service: "Anthropic" },
  { kind: "exact", host: "api.linear.app", service: "Linear" },
  { kind: "suffix", suffix: ".googleapis.com", service: "Google Cloud" },
];

export const resolvePeerService = (host: string): string | undefined => {
  for (const rule of PEER_SERVICE_RULES) {
    if (rule.kind === "exact" && rule.host === host) {
      return rule.service;
    }
    if (rule.kind === "suffix" && host.endsWith(rule.suffix)) {
      return rule.service;
    }
  }
  return undefined;
};

/**
 * Undici instrumentation configured to:
 *
 * - Tag spans with `peer.service` derived from the outbound host. Tempo's
 *   `service_graphs` processor turns this into an external-service edge
 *   in the service map.
 * - Name spans `METHOD path`. The host already lives in `peer.service`,
 *   so the span name only carries the path.
 */
export const createUndiciInstrumentation = (): UndiciInstrumentation =>
  new UndiciInstrumentation({
    startSpanHook: (request) => {
      try {
        // `hostname` strips the port unconditionally; `host` keeps it for
        // non-default ports (e.g. `collector:4318`), which would miss
        // exact-host matches in `resolvePeerService`.
        const { hostname } = new URL(request.origin);
        const peerService = resolvePeerService(hostname);
        return peerService ? { "peer.service": peerService } : {};
      } catch {
        return {};
      }
    },
    requestHook: (span, request) => {
      if (typeof request.path !== "string") {
        return;
      }
      // Strip query string to keep cardinality bounded.
      const path = request.path.split("?")[0];
      if (path) {
        span.updateName(`${request.method} ${path}`);
      }
    },
  });

/**
 * `requestHook` for `@opentelemetry/instrumentation-http` that names
 * spans `METHOD /path`. Path source depends on the request shape:
 * outgoing `ClientRequest` exposes `path`, incoming `IncomingMessage`
 * exposes `url`. `originalUrl` is checked first as a no-cost fallback
 * for the case where Express has already wrapped the request before
 * the hook reads it.
 */
export const httpRequestSpanNameHook: NonNullable<
  HttpInstrumentationConfig["requestHook"]
> = (span, request) => {
  if (!("method" in request) || !request.method) {
    return;
  }
  const candidates = [
    "originalUrl" in request ? request.originalUrl : undefined,
    "url" in request ? request.url : undefined,
    "path" in request ? request.path : undefined,
  ];
  const rawPath = candidates.find(
    (value): value is string => typeof value === "string",
  );
  // Strip query string to keep cardinality bounded.
  const path = rawPath?.split("?")[0];
  if (path) {
    span.updateName(`${request.method} ${path}`);
  }
};

/**
 * Outbound requests where a status is a defined outcome of the operation rather
 * than a failed call. semconv marks every client-side 4xx as an error, which is
 * wrong for a call whose purpose is to ask a question that may be answered with
 * "no".
 *
 * Matching is host-independent, so any dependency answering that method and
 * path with one of those statuses counts as expected.
 */
interface ExpectedClientStatusRule {
  method: string;
  path: string;
  statuses: readonly number[];
}

const EXPECTED_CLIENT_STATUS_RULES: readonly ExpectedClientStatusRule[] = [
  // Kratos session lookup: 401 is "no session", 403 is "AAL1 where AAL2 is
  // required". Callers treat both as an anonymous request.
  { method: "GET", path: "/sessions/whoami", statuses: [401, 403] },
];

export const isExpectedClientStatus = ({
  method,
  path,
  statusCode,
}: {
  method: string | undefined;
  path: string | undefined;
  statusCode: number | undefined;
}): boolean =>
  EXPECTED_CLIENT_STATUS_RULES.some(
    (rule) =>
      rule.method === method &&
      rule.path === path &&
      statusCode !== undefined &&
      rule.statuses.includes(statusCode),
  );

/** The hook is handed both directions and `SpanKind` is not passed to it. */
const isServerResponse = (
  response: IncomingMessage | ServerResponse,
): response is ServerResponse => "setHeader" in response;

/**
 * Marks a span whose error status {@link httpExpectedClientStatusHook} rewrote.
 * Needed because `parseResponseStatus` never yields `OK`, so without it `OK` on
 * a client span silently selects exactly the suppressed failures.
 */
export const EXPECTED_CLIENT_STATUS_ATTRIBUTE = "hash.expected_client_status";

/**
 * `applyCustomAttributesOnSpan` marking {@link EXPECTED_CLIENT_STATUS_RULES} as
 * successful, so Tempo's `service_graphs` processor stops counting them against
 * the edge to that dependency.
 *
 * `OK` rather than clearing the status, because the SDK drops `setStatus` with
 * `UNSET`.
 */
export const httpExpectedClientStatusHook: NonNullable<
  HttpInstrumentationConfig["applyCustomAttributesOnSpan"]
> = (span, request, response) => {
  if (isServerResponse(response)) {
    return;
  }
  const rawPath = "path" in request ? request.path : undefined;
  const isExpected = isExpectedClientStatus({
    method: "method" in request ? request.method : undefined,
    path: typeof rawPath === "string" ? rawPath.split("?")[0] : undefined,
    statusCode: response.statusCode,
  });
  if (isExpected) {
    span.setAttribute(EXPECTED_CLIENT_STATUS_ATTRIBUTE, true);
    span.setStatus({ code: SpanStatusCode.OK });
  }
};

/**
 * Default OTLP/gRPC port. Used when the configured endpoint URL does not
 * carry an explicit port (e.g. `http://collector` resolves via gRPC default).
 */
const DEFAULT_OTLP_PORT = 4317;

const otlpPortFromEndpoint = (otlpEndpoint: string): number => {
  try {
    const { port } = new URL(otlpEndpoint);
    return port ? Number.parseInt(port, 10) : DEFAULT_OTLP_PORT;
  } catch {
    // `registerOpenTelemetry` will surface the malformed-URL error when
    // it builds the exporter; here we just fall back so the filter does
    // not throw on every outgoing request.
    return DEFAULT_OTLP_PORT;
  }
};

/**
 * `@opentelemetry/instrumentation-http` configured for HASH services:
 *
 * - Skips outgoing requests to the OTLP collector port. Without this filter
 *   each export would itself produce a span, which would be batched for
 *   export, which would produce another span — amplifying export volume on
 *   every batch. The port is derived from `otlpEndpoint` so a non-default
 *   collector port (e.g. `:4318` for OTLP/HTTP) still gets ignored.
 * - Names spans `METHOD /path` via {@link httpRequestSpanNameHook}.
 * - Marks expected client-side failures as successful via
 *   {@link httpExpectedClientStatusHook}.
 *
 * Pass `extra` to merge per-service options (e.g. `ignoreIncomingPaths`).
 * `ignoreOutgoingRequestHook`, `requestHook` and
 * `applyCustomAttributesOnSpan` are intentionally not mergeable here —
 * callers needing different shapes should construct `HttpInstrumentation`
 * directly.
 */
export const createHttpInstrumentation = (
  otlpEndpoint: string,
  extra: Omit<
    HttpInstrumentationConfig,
    "applyCustomAttributesOnSpan" | "ignoreOutgoingRequestHook" | "requestHook"
  > = {},
): HttpInstrumentation => {
  const otlpPort = otlpPortFromEndpoint(otlpEndpoint);
  return new HttpInstrumentation({
    ...extra,
    ignoreOutgoingRequestHook: (options) =>
      // `RequestOptions.port` is `string | number | null | undefined`;
      // some callers (raw `http.request`, axios) pass a string. Coerce
      // to compare consistently — otherwise `"4317" === 4317` is false
      // and the exporter's own outbound traffic slips through.
      Number(options.port) === otlpPort,
    requestHook: httpRequestSpanNameHook,
    applyCustomAttributesOnSpan: httpExpectedClientStatusHook,
  });
};

const shutdownWithTimeout = async (
  label: string,
  shutdown: () => Promise<void>,
): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} shutdown exceeded ${shutdownTimeoutMs}ms — pending exports may be dropped.`,
        ),
      );
    }, shutdownTimeoutMs);
  });
  try {
    await Promise.race([shutdown(), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

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
    // Runs before any logger is wired up, so direct stderr is the
    // right channel.
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

  // Batch processors keep span / log export off the request path. The
  // Simple variants export each record synchronously, which under load
  // saturates the gRPC connection and adds tail latency to every
  // request.
  const traceExporter = new OTLPTraceExporter(collectorOptions);
  const traceProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  traceProvider.register();

  const logExporter = new OTLPLogExporter(collectorOptions);
  const logProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: logExporter })],
  });
  logs.setGlobalLoggerProvider(logProvider);

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

  return {
    endpoint,
    traceExporter,
    resource,
    shutdown: async () => {
      // Flush each provider with a per-provider timeout so a stuck
      // exporter (collector unreachable, gRPC channel hung) cannot
      // block the SIGTERM handler indefinitely. Failures are surfaced
      // to stderr because the logger may already be shutting down.
      const targets: Array<readonly [string, () => Promise<void>]> = [
        ["trace provider", () => traceProvider.shutdown()],
        ["log provider", () => logProvider.shutdown()],
        ["meter provider", () => meterProvider.shutdown()],
      ];
      const results = await Promise.allSettled(
        targets.map(async ([label, run]) => {
          try {
            await shutdownWithTimeout(label, run);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("OpenTelemetry %s shutdown failed:", label, error);
            throw error;
          }
        }),
      );
      unregisterInstrumentations();
      // `Promise.allSettled` itself never rejects, so without inspecting the
      // results the caller's `catch` block would never fire and downstream
      // exit-code / error-reporting logic would treat partial flush failures
      // as success. Surface them as an `AggregateError` so the caller can
      // react.
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason as unknown] : [],
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          "One or more OpenTelemetry providers failed to shut down",
        );
      }
    },
  };
};
