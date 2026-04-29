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
  // Sentry registers its own global `NodeTracerProvider` by default.
  // Letting it run after `registerOpenTelemetry` would replace the
  // provider that the OTEL workflow client interceptor (set up in
  // `createTemporalClient`) holds via `trace.getTracer(...)`, breaking
  // caller → workflow → activity context propagation. With this flag
  // Sentry shares our provider so its spans flow through the same
  // OTLP pipeline.
  skipOpenTelemetrySetup: !!otelSetup,
});

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { createCommonFlowActivities } from "@local/hash-backend-utils/flows";
import { Logger } from "@local/hash-backend-utils/logger";
import type { WorkflowSource } from "@local/hash-backend-utils/temporal/worker-bootstrap";
import { runWorker } from "@local/hash-backend-utils/temporal/worker-bootstrap";
import type { WorkflowTypeMap } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { config } from "dotenv-flow";

import { createFlowActivities } from "./activities/flow-activities.js";
import * as linearActivities from "./activities/linear-activities.js";
import * as workflows from "./workflows.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

// Ensures that all functions defined in WorkflowTypeMap are exported from the
// workflows file. They must be individually exported, and it's impossible to
// check completeness of exports in the file itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const exportMap: WorkflowTypeMap = workflows;

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

export const logger = new Logger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
  serviceName: "integration-worker",
});

const workflowSource: WorkflowSource =
  process.env.NODE_ENV === "production"
    ? {
        kind: "bundle",
        bundle: { codePath: require.resolve("../dist/workflow-bundle.js") },
      }
    : { kind: "path", workflowsPath: require.resolve("./workflows") };

async function run() {
  const graphApiClient = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  await runWorker({
    serviceName: "integration worker",
    taskQueue: "integration",
    healthCheckPort: 4300,
    activities: {
      ...linearActivities.createLinearIntegrationActivities({ graphApiClient }),
      ...createFlowActivities({ graphApiClient }),
      ...createCommonFlowActivities({ graphApiClient }),
    },
    workflowSource,
    otelSetup,
    logger,
  });
}

run().catch((error: unknown) => {
  logger.error("Error running worker", { error });
  process.exit(1);
});
