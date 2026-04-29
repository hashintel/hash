/* eslint-disable import/first, import/order, simple-import-sort/imports */

// Must be the first import so OTEL auto-instrumentations can patch
// http / grpc / Sentry's own monkey-patches before they apply.
import { otelSetup } from "./instrument.js";

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_INTEGRATION_SENTRY_DSN,
  enabled: !!process.env.HASH_TEMPORAL_WORKER_INTEGRATION_SENTRY_DSN,
  environment:
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    process.env.SENTRY_ENVIRONMENT ||
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    process.env.ENVIRONMENT ||
    (process.env.NODE_ENV === "production" ? "production" : "development"),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
  // When OTEL is configured we already have a global TracerProvider
  // wired up to OTLP. Tell Sentry to share it instead of registering its
  // own, so Sentry's spans flow through our pipeline and inherit the
  // active OTEL context (including parent spans extracted from Temporal
  // headers by OpenTelemetryActivityInboundInterceptor).
  skipOpenTelemetrySetup: !!process.env.HASH_OTLP_ENDPOINT,
});

import * as http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { createCommonFlowActivities } from "@local/hash-backend-utils/flows";
import { Logger } from "@local/hash-backend-utils/logger";
import { OpenTelemetryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/opentelemetry";
import { SentryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/sentry";
import { sentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { createTemporalSdkLogger } from "@local/hash-backend-utils/temporal";
import { wrapWorkflowSpanExporter } from "@local/hash-backend-utils/temporal/workflow-span-adapter";
import type { WorkflowTypeMap } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { makeWorkflowExporter } from "@temporalio/interceptors-opentelemetry";
import type { ActivityInboundCallsInterceptorFactory } from "@temporalio/worker";
import {
  defaultSinks,
  NativeConnection,
  Runtime,
  Worker,
} from "@temporalio/worker";
import { config } from "dotenv-flow";

import { createFlowActivities } from "./activities/flow-activities.js";
import * as linearActivities from "./activities/linear-activities.js";
import * as workflows from "./workflows.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

// This is a workaround to ensure that all functions defined in WorkflowTypeMap are exported from the workflows file
// They must be individually exported from the file, and it's impossible to check completeness of exports in the file itself
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const exportMap: WorkflowTypeMap = workflows;

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

export const logger = new Logger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
  serviceName: "integration-worker",
});

const TEMPORAL_HOST = new URL(
  process.env.HASH_TEMPORAL_SERVER_HOST ?? "http://localhost",
).hostname;
const TEMPORAL_PORT = process.env.HASH_TEMPORAL_SERVER_PORT
  ? parseInt(process.env.HASH_TEMPORAL_SERVER_PORT, 10)
  : 7233;

const createHealthCheckServer = () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          msg: "worker healthy",
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("");
  });

  return server;
};

const workflowOption = () =>
  process.env.NODE_ENV === "production"
    ? {
        workflowBundle: {
          codePath: require.resolve("../dist/workflow-bundle.js"),
        },
      }
    : { workflowsPath: require.resolve("./workflows") };

async function run() {
  logger.info("Starting integration worker...");

  // Temporal SDK runtime telemetry: emits SDK-internal metrics (worker
  // slot utilisation, sticky cache hits, polling latency, activity /
  // workflow execution latency) and forwards Rust core logs to OTLP.
  // Must be installed before any Temporal Connection / Worker is
  // created. Distinct from the per-activity user-code spans the
  // interceptors below produce.
  if (otelSetup) {
    Runtime.install({
      // Pipe Rust-core SDK logs through the same structured logger as
      // the rest of the worker, so they end up on the OTLP transport
      // alongside app logs instead of bypassing it to stderr.
      logger: createTemporalSdkLogger(logger),
      telemetryOptions: {
        metrics: {
          otel: {
            url: process.env.HASH_OTLP_ENDPOINT!,
            metricsExportInterval: "30s",
          },
        },
        logging: { forward: { level: "INFO" } },
      },
    });
  }

  const graphApiClient = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  const worker = await Worker.create({
    ...workflowOption(),
    activities: {
      ...linearActivities.createLinearIntegrationActivities({
        graphApiClient,
      }),
      ...createFlowActivities({
        graphApiClient,
      }),
      ...createCommonFlowActivities({ graphApiClient }),
    },
    connection: await NativeConnection.connect({
      address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
    }),
    namespace: "HASH",
    taskQueue: "integration",
    sinks: {
      ...defaultSinks(),
      ...sentrySinks(),
      ...(otelSetup
        ? {
            exporter: makeWorkflowExporter(
              // Wrap our v2 OTLPTraceExporter so it can ingest the v1-
              // shaped `ReadableSpan`s that Temporal's workflow sandbox
              // produces. Without this, the `instrumentationLibrary` →
              // `instrumentationScope` rename in sdk-trace-base v2
              // causes the OTLP transformer to crash on every workflow
              // span export.
              wrapWorkflowSpanExporter(
                otelSetup.traceExporter,
              ) as unknown as Parameters<typeof makeWorkflowExporter>[0],
              otelSetup.resource as unknown as Parameters<
                typeof makeWorkflowExporter
              >[1],
            ),
          }
        : {}),
    },
    interceptors: {
      workflowModules: [
        require.resolve(
          "@local/hash-backend-utils/temporal/interceptors/workflows/sentry",
        ),
        ...(otelSetup
          ? [
              require.resolve(
                "@local/hash-backend-utils/temporal/interceptors/workflows/opentelemetry",
              ),
            ]
          : []),
      ],
      // OTEL interceptor must run as the OUTER wrapper so it can
      // extract the trace context the workflow client injected into
      // the activity headers before any other span is created. Sentry
      // doesn't know the Temporal `_tracer-data` header convention, so
      // a Sentry-first ordering produces a parent-less span and breaks
      // the caller→workflow→activity trace chain.
      activityInbound: [
        ...((otelSetup
          ? [(ctx) => new OpenTelemetryActivityInboundInterceptor(ctx)]
          : []) satisfies ActivityInboundCallsInterceptorFactory[]),
        (ctx) => new SentryActivityInboundInterceptor(ctx),
      ],
    },
  });

  const httpServer = createHealthCheckServer();
  const port = 4300;
  httpServer.listen({ host: "0.0.0.0", port });
  logger.info(`HTTP server listening on port ${port}`);

  await worker.run();
}

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info(`Received ${signal}, exiting...`);
  // Flush any pending OTLP exports before tearing down the process.
  // Without this, the last seconds of telemetry are lost on every
  // graceful restart.
  try {
    await otelSetup?.shutdown();
  } catch (error) {
    logger.error("Failed to flush OpenTelemetry", { error });
  }
  process.exit(1);
};

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));

run().catch((error: unknown) => {
  logger.error("Error running worker", { error });
  process.exit(1);
});
