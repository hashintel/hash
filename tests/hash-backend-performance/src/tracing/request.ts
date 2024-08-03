import type { SpanContext } from "@opentelemetry/api";
import opentelemetry from "@opentelemetry/api";

import type { AfterResponseFn, BeforeRequestFn } from "../types";
import type { TracingContext } from "./sdk";

export const createTraceHeaders = (
  spanContext: SpanContext | undefined = opentelemetry.trace
    .getActiveSpan()
    ?.spanContext(),
): { traceparent?: string } =>
  spanContext
    ? {
        traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-${`0${spanContext.traceFlags.toString(16)}`.slice(-2)}`,
      }
    : {};

export const enterRequestSpan: BeforeRequestFn<
  Record<string, never>,
  TracingContext
  // eslint-disable-next-line @typescript-eslint/require-await
> = async (requestParams, context) => {
  if (!context.scenario.tracing) {
    throw new Error("Tracing context not initialized");
  }

  context.scenario.tracing.startRequest(
    requestParams.name ?? requestParams.url,
  );

  const span = opentelemetry.trace.getSpan(context.scenario.tracing.context);
  if (span) {
    // eslint-disable-next-line no-param-reassign
    requestParams.headers = {
      ...(requestParams.headers ?? {}),
      ...createTraceHeaders(span.spanContext()),
    };
  }
};

export const exitRequestSpan: AfterResponseFn<
  Record<string, never>,
  TracingContext
  // eslint-disable-next-line @typescript-eslint/require-await
> = async (_requestParams, _response, context) => {
  if (!context.scenario.tracing) {
    throw new Error("Tracing context not initialized");
  }

  context.scenario.tracing.endRequest();
};
