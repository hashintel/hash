/**
 * Bridge between `@temporalio/interceptors-opentelemetry` (which pins
 * `@opentelemetry/sdk-trace-base@^1`) and our `@opentelemetry/sdk-trace-base@2`
 * stack. Two field renames matter on the v1→v2 boundary:
 *
 * - `instrumentationLibrary` → `instrumentationScope`: v2's
 *   `OTLPTraceExporter` crashes inside `createResourceMap` reading
 *   `span.instrumentationScope.name` on a v1-shaped object.
 * - `parentSpanId: string` → `parentSpanContext: SpanContext`: v2's
 *   OTLP transformer encodes parent linkage from `parentSpanContext.spanId`
 *   only. v1-shaped spans carry `parentSpanId` but no `parentSpanContext`,
 *   so without translation the OTLP envelope ships with no parent and
 *   Tempo renders every workflow/activity span as a root in the trace.
 *
 * `wrapWorkflowSpanExporter` returns a `SpanExporter` that synthesises
 * the v2-shaped fields on each span on its way in.
 *
 * TODO(BE-520): drop this adapter when
 * `@temporalio/interceptors-opentelemetry-v2` (PR
 * https://github.com/temporalio/sdk-typescript/pull/1951) is released.
 */
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

interface LegacyReadableSpan {
  instrumentationLibrary?: {
    name: string;
    version?: string;
    schemaUrl?: string;
  };
  instrumentationScope?: { name: string; version?: string; schemaUrl?: string };
  parentSpanId?: string;
}

const normaliseSpan = (span: ReadableSpan): ReadableSpan => {
  // The cast loses runtime correctness intentionally — Temporal's
  // `extractReadableSpan` produces v1-shaped objects whose
  // `instrumentationScope` and `parentSpanContext` are genuinely
  // undefined at runtime, even though v2's `ReadableSpan` types them
  // as required / present.
  const legacy = span as ReadableSpan & LegacyReadableSpan;

  const needsScope = !legacy.instrumentationScope;
  const needsParent = legacy.parentSpanId && !legacy.parentSpanContext;
  if (!needsScope && !needsParent) {
    return span;
  }

  // Without an instrumentation identifier the OTLP resource-map logic
  // still throws, so synthesise an "unknown" scope rather than letting
  // the export crash.
  const instrumentationScope = legacy.instrumentationScope ??
    legacy.instrumentationLibrary ?? { name: "unknown" };

  let parentSpanContext = legacy.parentSpanContext;
  if (legacy.parentSpanId && !parentSpanContext) {
    const ctx = span.spanContext();
    parentSpanContext = {
      traceId: ctx.traceId,
      spanId: legacy.parentSpanId,
      traceFlags: ctx.traceFlags,
      // The parent lives outside this span exporter's sandbox — either
      // in the worker's host process (RunWorkflow / RunActivity) or in
      // the workflow client (e.g. an Express HTTP span).
      isRemote: true,
    };
  }

  return Object.assign(
    Object.create(Object.getPrototypeOf(span) as object),
    span,
    { instrumentationScope, parentSpanContext },
  ) as ReadableSpan;
};

export const wrapWorkflowSpanExporter = (
  inner: SpanExporter,
): SpanExporter => ({
  export(spans, resultCallback): void {
    const adapted = spans.map(normaliseSpan);
    inner.export(adapted, (result: ExportResult) => resultCallback(result));
  },
  shutdown: () => inner.shutdown(),
  forceFlush: () => inner.forceFlush?.() ?? Promise.resolve(),
});
