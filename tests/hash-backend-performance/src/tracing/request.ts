import type { Context, SpanContext } from "@opentelemetry/api";
import opentelemetry from "@opentelemetry/api";

import type { AfterResponseFn, BeforeRequestFn } from "../types";
import type { TracingContext } from "./sdk";

export const createTraceHeaders = (
  context: Context | undefined = opentelemetry.context.active(),
): { traceparent?: string } => {
  const traceHeaders = {};
  opentelemetry.propagation.inject(context, traceHeaders);
  return traceHeaders;
};

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
  opentelemetry.propagation.inject(
    context.scenario.tracing.context,
    requestParams.headers,
  );
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
