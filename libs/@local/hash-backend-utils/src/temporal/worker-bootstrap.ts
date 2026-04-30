/**
 * Shared bootstrap for HASH Temporal workers. Both
 * `hash-ai-worker-ts` and `hash-integration-worker` enter through
 * `runWorker`, supplying per-service deltas (service name, task queue,
 * port, activities, workflow bundle path) as options.
 *
 * `Sentry.init` stays in each worker's `main.ts` because ESM import
 * ordering requires it before the rest of the imports — that cannot
 * be reproduced from a helper module. Everything from `Runtime.install`
 * onwards is centralised here.
 */
import * as http from "node:http";
import { createRequire } from "node:module";

import type {
  ActivityInterceptorsFactory,
  WorkerOptions,
  WorkflowBundleOption,
} from "@temporalio/worker";
import {
  defaultSinks,
  NativeConnection,
  Runtime,
  Worker,
} from "@temporalio/worker";

import type { Logger } from "../logger.js";
import type { OpenTelemetrySetup } from "../opentelemetry.js";
import { createTemporalSdkLogger } from "../temporal.js";
import {
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "./interceptors/activities/opentelemetry.js";
import { SentryActivityInboundInterceptor } from "./interceptors/activities/sentry.js";
import { sentrySinks } from "./sinks/sentry.js";
import { makeV2WorkflowSink } from "./workflow-span-adapter.js";

const require = createRequire(import.meta.url);

const TEMPORAL_DEFAULT_PORT = 7233;

const getTemporalAddress = (): string => {
  const host = new URL(
    process.env.HASH_TEMPORAL_SERVER_HOST ?? "http://localhost",
  ).hostname;
  const port = process.env.HASH_TEMPORAL_SERVER_PORT
    ? parseInt(process.env.HASH_TEMPORAL_SERVER_PORT, 10)
    : TEMPORAL_DEFAULT_PORT;
  return `${host}:${port}`;
};

const createHealthCheckServer = (): http.Server =>
  http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ msg: "worker healthy" }));
      return;
    }
    res.writeHead(404);
    res.end("");
  });

/**
 * Source of workflow code passed to `Worker.create`.
 *
 * - `bundle` — a prebuilt webpack bundle (`workflowBundle.codePath`),
 *   produced by the per-worker `bundle-workflow-code.ts` script. Used
 *   in production builds.
 * - `path` — a TypeScript entry-point that the worker bundles in-process
 *   (`workflowsPath`), with optional `bundlerOptions` for things like
 *   `tsconfig-paths-webpack-plugin`. Used in development.
 */
export type WorkflowSource =
  | { kind: "bundle"; bundle: WorkflowBundleOption }
  | {
      kind: "path";
      workflowsPath: string;
      bundlerOptions?: WorkerOptions["bundlerOptions"];
    };

/**
 * Per-worker tuning passed straight through to `Worker.create`. Keys
 * owned by the helper (`activities`, `connection`, `namespace`,
 * `taskQueue`, `sinks`, `interceptors`) and the workflow-source keys
 * (`workflowBundle`, `workflowsPath`, `bundlerOptions`) are excluded —
 * `workflowSource` is the only way to set them.
 */
export type ExtraWorkerOptions = Omit<
  WorkerOptions,
  | "activities"
  | "connection"
  | "namespace"
  | "taskQueue"
  | "sinks"
  | "interceptors"
  | "workflowBundle"
  | "workflowsPath"
  | "bundlerOptions"
>;

export interface RunWorkerOptions {
  /**
   * Logged once at startup and used as `service.name` for OTEL traces /
   * logs / metrics. The Temporal worker identity stays at the SDK default
   * (`pid@hostname`) so multiple replicas remain distinguishable in the
   * Temporal UI.
   */
  serviceName: string;
  /** Temporal task queue this worker pulls work from. */
  taskQueue: string;
  /** Port the health-check server listens on. */
  healthCheckPort: number;
  /**
   * Activities object passed to `Worker.create({ activities })`. The
   * caller assembles this from per-worker activity factories.
   */
  activities: WorkerOptions["activities"];
  /** Where the workflow code lives. See {@link WorkflowSource}. */
  workflowSource: WorkflowSource;
  /**
   * Additional `Worker.create` options for per-worker tuning (e.g.
   * `maxHeartbeatThrottleInterval`).
   */
  workerOptions?: ExtraWorkerOptions;
  /** OTEL setup handle from `instrument.ts`; `undefined` disables OTEL wiring. */
  otelSetup: OpenTelemetrySetup | undefined;
  /** Application logger shared with the rest of the worker. */
  logger: Logger;
}

const expandWorkflowSource = (
  source: WorkflowSource,
): Pick<
  WorkerOptions,
  "workflowBundle" | "workflowsPath" | "bundlerOptions"
> => {
  switch (source.kind) {
    case "bundle":
      return { workflowBundle: source.bundle };
    case "path":
      return {
        workflowsPath: source.workflowsPath,
        bundlerOptions: source.bundlerOptions,
      };
  }
};

/**
 * Boot a HASH Temporal worker. Installs the Temporal SDK runtime
 * telemetry (when OTEL is configured), connects to the Temporal server,
 * builds the activity interceptor chain, registers the workflow + sink
 * wiring, starts a health-check HTTP server, and finally enters
 * `worker.run()`. Returns once the worker has drained on SIGTERM/SIGINT.
 */
export async function runWorker(opts: RunWorkerOptions): Promise<void> {
  const { logger, otelSetup } = opts;

  logger.info(`Starting ${opts.serviceName}...`);

  // Temporal SDK runtime telemetry: emits SDK-internal metrics (worker
  // slot utilisation, sticky cache hits, polling latency, activity /
  // workflow execution latency) directly to OTLP, and forwards Rust
  // core logs through the Node-side logger so they share the
  // application's log pipeline. Must run before any Connection /
  // Worker is created. Separate channel from the per-activity user-code
  // spans the interceptors below produce.
  if (otelSetup) {
    Runtime.install({
      logger: createTemporalSdkLogger(logger),
      telemetryOptions: {
        metrics: {
          otel: {
            url: otelSetup.endpoint,
            metricsExportInterval: "30s",
          },
        },
        logging: { forward: { level: "INFO" } },
      },
    });
  }

  const connection = await NativeConnection.connect({
    address: getTemporalAddress(),
  });
  logger.info("Created Temporal connection");

  // OTEL interceptor must precede Sentry: `composeInterceptors` builds
  // the chain right-to-left so index 0 is outermost. The OTEL inbound
  // half extracts the trace context that the workflow's outbound OTEL
  // interceptor injected via `scheduleActivity`, re-establishing the
  // parent before any other interceptor opens a span. The outbound half
  // stamps `trace_id` / `span_id` / `trace_flags` onto activity log
  // lines so Loki ↔ Tempo correlation works.
  const activityInterceptors: ActivityInterceptorsFactory[] = [];
  if (otelSetup) {
    activityInterceptors.push((ctx) => ({
      inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
      outbound: new OpenTelemetryActivityOutboundInterceptor(ctx),
    }));
  }
  activityInterceptors.push((ctx) => ({
    inbound: new SentryActivityInboundInterceptor(ctx),
  }));

  const worker = await Worker.create({
    ...opts.workerOptions,
    ...expandWorkflowSource(opts.workflowSource),
    activities: opts.activities,
    connection,
    namespace: "HASH",
    taskQueue: opts.taskQueue,
    sinks: {
      ...defaultSinks(),
      ...sentrySinks(),
      ...(otelSetup ? { exporter: makeV2WorkflowSink(otelSetup) } : {}),
    },
    interceptors: {
      workflowModules: [
        require.resolve(
          "@local/hash-backend-utils/temporal/interceptors/workflows/sentry",
        ),
        require.resolve(
          "@local/hash-backend-utils/temporal/interceptors/workflows/opentelemetry",
        ),
      ],
      activity: activityInterceptors,
    },
  });

  const httpServer = createHealthCheckServer();
  httpServer.on("error", (error) =>
    logger.error("Health-check server error", { error }),
  );
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.removeListener("error", onError);
      reject(error);
    };
    httpServer.once("error", onError);
    httpServer.listen({ host: "0.0.0.0", port: opts.healthCheckPort }, () => {
      httpServer.removeListener("error", onError);
      logger.info(`HTTP server listening on port ${opts.healthCheckPort}`);
      resolve();
    });
  });

  // Start the worker; `worker.run()` resolves once the SDK has fully
  // drained in-flight activities after `worker.shutdown()` is called.
  // The shutdown handler awaits this promise so SIGTERM doesn't kill
  // activities mid-execution.
  const workerRunPromise = worker.run();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`Received ${signal}, exiting...`);
    let exitCode = 0;
    try {
      worker.shutdown();
    } catch (error) {
      logger.error("Worker shutdown trigger failed", { error });
      exitCode = 1;
    }
    try {
      await workerRunPromise;
    } catch (error) {
      logger.error("Worker drain failed", { error });
      exitCode = 1;
    }
    try {
      httpServer.close();
    } catch (error) {
      logger.error("Health-check server close failed", { error });
    }
    try {
      await otelSetup?.shutdown();
    } catch (error) {
      logger.error("Failed to flush OpenTelemetry", { error });
      exitCode = 1;
    }
    process.exit(exitCode);
  };

  const onSignal = (signal: NodeJS.Signals) => {
    shutdown(signal).catch((error: unknown) => {
      logger.error("Shutdown handler threw", { error });
      process.exit(1);
    });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  await workerRunPromise;
}
