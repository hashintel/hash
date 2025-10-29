import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {
  ExpressInstrumentation,
  ExpressLayerType,
} from "@opentelemetry/instrumentation-express";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { logger } from "../logger";

const traceTimeout = 5000;

const unregisterInstrumentations = registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({
      ignoreOutgoingRequestHook: (options) => {
        return options.port === 4317;
      },
    }),
    new ExpressInstrumentation({
      ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
    }),
    new GraphQLInstrumentation({
      allowValues: true,
      depth: 5,
      mergeItems: true,
      ignoreTrivialResolveSpans: true,
    }),
  ],
});

export const registerOpenTelemetry = (
  otlpGrpcEndpoint: string | null,
  serviceName: string,
): (() => void) => {
  if (!otlpGrpcEndpoint) {
    logger.warn(
      "No OpenTelemetry Protocol endpoint given. Not sending telemetry anywhere.",
    );
    return () => {};
  }

  const collectorOptions = {
    timeoutMillis: traceTimeout,
    url: otlpGrpcEndpoint,
  };

  // Setup Tracing
  const traceExporter = new OTLPTraceExporter(collectorOptions);
  const traceProvider = new NodeTracerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({ "service.name": serviceName }),
    ),
    spanProcessors: [new SimpleSpanProcessor(traceExporter)],
  });
  traceProvider.register();

  // Setup Logs
  const logExporter = new OTLPLogExporter(collectorOptions);
  const logProvider = new LoggerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({ "service.name": serviceName }),
    ),
    processors: [new SimpleLogRecordProcessor(logExporter)],
  });

  logs.setGlobalLoggerProvider(logProvider);

  logger.info(
    `Registered OpenTelemetry (traces + logs) at endpoint ${otlpGrpcEndpoint} for ${serviceName}`,
  );

  return () => {
    traceProvider.shutdown().catch(logger.error);
    logProvider.shutdown().catch(logger.error);
    unregisterInstrumentations();
  };
};
