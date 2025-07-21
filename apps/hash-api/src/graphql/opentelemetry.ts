import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {
  ExpressInstrumentation,
  ExpressLayerType,
} from "@opentelemetry/instrumentation-express";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
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

export const registerOpenTelemetryTracing = (
  otlpGrpcEndpoint: string | null,
  serviceName: string,
): (() => void) => {
  if (!otlpGrpcEndpoint) {
    logger.warn(
      "No OpenTelemetry Protocol endpoint given. Not sending tracespans anywhere.",
    );
    return () => {};
  }

  const collectorOptions = {
    timeoutMillis: traceTimeout,
    url: otlpGrpcEndpoint,
  };

  const exporter = new OTLPTraceExporter(collectorOptions);

  const provider = new NodeTracerProvider({
    resource: Resource.default().merge(
      new Resource({ "service.name": serviceName }),
    ),
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  provider.register();

  logger.info(
    `Registered OpenTelemetry trace exporter at endpoint ${otlpGrpcEndpoint} for ${serviceName}`,
  );

  return () => {
    provider.shutdown().catch(logger.error);
    unregisterInstrumentations();
  };
};
