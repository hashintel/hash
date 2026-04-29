/* eslint-disable import/first, import/order, simple-import-sort/imports */

// Must be the first import so OTEL auto-instrumentations can patch
// http / grpc / Sentry's own monkey-patches before they apply.
import { otelSetup } from "./instrument.js";

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  enabled: !!process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
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
import { OpenTelemetryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/opentelemetry";
import { SentryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/sentry";
import { sentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { createTemporalSdkLogger } from "@local/hash-backend-utils/temporal";
import { wrapWorkflowSpanExporter } from "@local/hash-backend-utils/temporal/workflow-span-adapter";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import { makeWorkflowExporter } from "@temporalio/interceptors-opentelemetry";
import type {
  ActivityInboundCallsInterceptorFactory,
  WorkerOptions,
} from "@temporalio/worker";
import {
  defaultSinks,
  NativeConnection,
  Runtime,
  Worker,
} from "@temporalio/worker";
import { config } from "dotenv-flow";
import { TsconfigPathsPlugin } from "tsconfig-paths-webpack-plugin";

import { createAiActivities, createGraphActivities } from "./activities.js";
import { createFlowActivities } from "./activities/flow-activities.js";
import { logger } from "./shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

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

const workflowOptions: Partial<WorkerOptions> =
  process.env.NODE_ENV === "production"
    ? {
        workflowBundle: {
          codePath: require.resolve("../dist/workflow-bundle.js"),
        },
      }
    : {
        bundlerOptions: {
          webpackConfigHook: (webpackConfig) => {
            return {
              ...webpackConfig,
              resolve: {
                ...webpackConfig.resolve,
                plugins: [
                  ...((webpackConfig.plugins as [] | undefined) ?? []),
                  /**
                   * Because we run TypeScript directly in development, we need to use the 'paths' in the base tsconfig.json
                   * This tells TypeScript where to resolve the imports from, overwriting the 'exports' in local dependencies' package.jsons,
                   * which refer to the transpiled JavaScript code. This plugin converts the 'paths' to webpack 'alias'.
                   */
                  new TsconfigPathsPlugin({
                    configFile:
                      "../../libs/@local/tsconfig/legacy-base-tsconfig-to-refactor.json",
                  }),
                ],
              },
            };
          },
        },
        workflowsPath: require.resolve("./workflows"),
      };

async function run() {
  logger.info("Starting AI worker...");

  // Temporal SDK runtime telemetry: emits SDK-internal metrics (worker
  // slot utilisation, sticky cache hits, polling latency, activity /
  // workflow execution latency) and forwards Rust core logs to OTLP.
  // Must be installed before any Temporal Connection / Worker is
  // created. Distinct from the per-activity user-code spans the
  // interceptors below produce.
  if (otelSetup) {
    Runtime.install({
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

  logger.info("Created Graph client");

  const vaultClient = await createVaultClient({ logger });

  if (!vaultClient) {
    throw new Error("Failed to create Vault client, check preceding logs.");
  }

  logger.info("Created Vault client");

  const connection = await NativeConnection.connect({
    address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
  });
  logger.info("Created Temporal connection");

  const worker = await Worker.create({
    ...workflowOptions,
    activities: {
      ...createAiActivities({
        graphApiClient,
      }),
      ...createGraphActivities({
        graphApiClient,
      }),
      ...createFlowActivities({ vaultClient }),
      ...createCommonFlowActivities({ graphApiClient }),
    },
    connection,
    /**
     * The maximum time that may elapse between heartbeats being processed by the server.
     * The default maxHeartbeatThrottleInterval is 60s.
     * Throttling is also capped at 80% of the heartbeatTimeout set when proxying an activity.
     */
    maxHeartbeatThrottleInterval: "10 seconds",
    namespace: "HASH",
    taskQueue: "ai",
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
  const port = 4100;
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
