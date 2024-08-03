import type { Context as OtelContext, Span } from "@opentelemetry/api";
import opentelemetry, { ROOT_CONTEXT, SpanKind } from "@opentelemetry/api";
import type { SpanOptions } from "@opentelemetry/api/build/src/trace/SpanOptions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import type { ActionFn, Context } from "../types";

class Tracing {
  #scenario?: { context: OtelContext; span: Span };
  #request?: { context: OtelContext; span: Span };

  constructor(name?: string, options?: SpanOptions) {
    if (name) {
      this.startScenario(name, options);
    }
  }

  startScenario(name: string, options?: SpanOptions): Span {
    const span = opentelemetry.trace
      .getTracer("@tests/hash-backend-performance/tracing/scenario")
      .startSpan(
        name,
        {
          kind: SpanKind.CLIENT,
          ...(options ?? {}),
        },
        ROOT_CONTEXT,
      );
    this.#scenario = {
      context: opentelemetry.trace.setSpan(ROOT_CONTEXT, span),
      span,
    };
    return span;
  }

  endScenario() {
    if (this.#scenario) {
      this.#scenario.span.end();
      this.#scenario = undefined;
    }
  }

  startRequest(name: string, options?: SpanOptions): Span {
    const span = opentelemetry.trace
      .getTracer("@tests/hash-backend-performance/tracing/scenario")
      .startSpan(
        name,
        {
          kind: SpanKind.CLIENT,
          ...(options ?? {}),
        },
        this.#scenario?.context ?? ROOT_CONTEXT,
      );
    this.#request = {
      context: opentelemetry.trace.setSpan(
        this.#scenario?.context ?? ROOT_CONTEXT,
        span,
      ),
      span,
    };
    return span;
  }

  endRequest() {
    if (this.#request) {
      this.#request.span.end();
      this.#request = undefined;
    }
  }

  get context(): OtelContext {
    return this.#request?.context ?? this.#scenario?.context ?? ROOT_CONTEXT;
  }
}

export type TracingContext = {
  tracing: Tracing;
};

export const startSpan = async <
  Vars extends Record<string, unknown>,
  Scenario extends TracingContext,
>(
  name: string,
  context: Context<Partial<Vars>, Partial<Scenario>>,
  fn: () => Promise<void>,
) =>
  opentelemetry.trace
    .getTracer("@tests/hash-backend-performance/tracing/sdk")
    .startActiveSpan(
      name,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "vu.uuid": context.vars.$uuid,
          test_id: context.vars.$testId,
        },
      },
      context.scenario.tracing?.context ?? opentelemetry.context.active(),
      async (span) => {
        await fn();
        span.end();
      },
    );

let sdkShutdown: (() => Promise<void>) | undefined;

export const initializeTracing: ActionFn<
  Record<string, never>,
  TracingContext
  // eslint-disable-next-line @typescript-eslint/require-await
> = async (context) => {
  if (sdkShutdown) {
    return;
  }

  const sdk = new NodeSDK({
    resource: Resource.default().merge(
      new Resource({
        [SEMRESATTRS_SERVICE_NAME]: "Artillery",
      }),
    ),
    traceExporter: new OTLPTraceExporter(),
  });
  sdk.start();

  const tracing = new Tracing(context.scenario.name);
  context.scenario.tracing = tracing;

  sdkShutdown = async () => {
    tracing.endScenario();
    await sdk.shutdown();
  };
};

export const tearDownTracing: ActionFn<
  Record<string, never>,
  TracingContext
> = async () => {
  if (sdkShutdown) {
    await sdkShutdown();
    sdkShutdown = undefined;
  }
};
