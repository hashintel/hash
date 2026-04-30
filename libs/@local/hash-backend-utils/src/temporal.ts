import { trace } from "@opentelemetry/api";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { OpenTelemetryWorkflowClientInterceptor } from "@temporalio/interceptors-opentelemetry";

import { getRequiredEnv } from "./environment.js";

export { Client as TemporalClient } from "@temporalio/client";

export const temporalNamespace = "HASH";

export const createTemporalClient = async () => {
  const temporalServerHost = getRequiredEnv("HASH_TEMPORAL_SERVER_HOST");

  const host = new URL(temporalServerHost).hostname;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
  const port = parseInt(process.env.HASH_TEMPORAL_SERVER_PORT || "7233", 10);

  const connection = await Connection.connect({
    address: `${host}:${port}`,
  });

  // When OTEL is configured the active trace context (e.g. an Express
  // HTTP span) is injected into workflow start headers. The worker-side
  // interceptors extract it and parent the workflow + activity spans
  // off the caller's trace.
  const interceptors = process.env.HASH_OTLP_ENDPOINT
    ? {
        workflow: [
          new OpenTelemetryWorkflowClientInterceptor({
            tracer: trace.getTracer("@temporalio/interceptors-opentelemetry"),
          }),
        ],
      }
    : undefined;

  return new TemporalClient({
    connection,
    namespace: temporalNamespace,
    interceptors,
  });
};
