import { connect } from "node:net";

import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import {
  createHttpInstrumentation,
  createUndiciInstrumentation,
  type OpenTelemetrySetup,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";

import { logger } from "./logger.ts";

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
  environment: NodeJS.ProcessEnv = process.env,
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

const COLLECTOR_PROBE_TIMEOUT_MS = 750;

/** One TCP connect to the collector, so a dead endpoint is known before exporters exist. */
export const probeCollector = (
  endpoint: string,
  timeoutMs: number = COLLECTOR_PROBE_TIMEOUT_MS,
): Promise<boolean> =>
  new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      resolve(false);
      return;
    }
    const socket = connect({
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });

/**
 * Outside production, a configured but unreachable collector is dropped
 * before exporters are registered: otherwise every export interval prints a
 * gRPC stack over the diagnostics a developer is actually reading. Production
 * keeps its requirement and never probes.
 */
export const withReachableCollector = async (
  environment: NodeJS.ProcessEnv = process.env,
  probe: (endpoint: string) => Promise<boolean> = probeCollector,
): Promise<NodeJS.ProcessEnv> => {
  const endpoint = environment.HASH_OTLP_ENDPOINT?.trim();
  if (environment.NODE_ENV === "production" || !endpoint) return environment;
  if (await probe(endpoint)) return environment;
  // Host and port only: a collector URL may carry credentials.
  let target: string | undefined;
  try {
    const url = new URL(endpoint);
    target = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    target = undefined;
  }
  logger.warn(
    "[brunch] HASH_OTLP_ENDPOINT is unreachable; running without exporters",
    { stage: "telemetry.collector", target },
  );
  const { HASH_OTLP_ENDPOINT: _unreachable, ...rest } = environment;
  return rest;
};

export const installBrunchTelemetry = async (): Promise<() => Promise<void>> =>
  instrument(
    createBrunchTelemetryInstrumentation(await withReachableCollector()),
  );

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
