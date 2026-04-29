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
 * the v2-shaped fields on each span on its way in. `makeV2WorkflowSink`
 * is the standard entry point for worker bootstraps — it produces a
 * `WorkflowSinks` entry from an `OpenTelemetrySetup`, hiding the v1↔v2
 * type-cast in one place.
 *
 * TODO(BE-520): drop this adapter when
 * `@temporalio/interceptors-opentelemetry-v2` (PR
 * https://github.com/temporalio/sdk-typescript/pull/1951) is released.
 */
import type { SpanContext } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { makeWorkflowExporter } from "@temporalio/interceptors-opentelemetry";

import type { OpenTelemetrySetup } from "../opentelemetry.js";

/**
 * v1-shaped fields that may appear on spans produced by Temporal's
 * `extractReadableSpan`. The v2 `instrumentationScope` and
 * `parentSpanContext` fields are also re-declared as optional because
 * the runtime shape is narrower than v2's `ReadableSpan` types pretend
 * — `extractReadableSpan` genuinely produces objects where they are
 * `undefined`.
 */
interface LegacyReadableSpan {
  instrumentationLibrary?: {
    name: string;
    version?: string;
    schemaUrl?: string;
  };
  instrumentationScope?: { name: string; version?: string; schemaUrl?: string };
  parentSpanId?: string;
  parentSpanContext?: SpanContext;
}

/**
 * `Omit` the v2 fields the legacy spans don't reliably populate, then
 * re-add them via `LegacyReadableSpan` as optional. Without this the
 * intersection inherits v2's required `instrumentationScope` typing
 * and TypeScript flags every defensive `?? fallback` as "always truthy".
 */
type FlexibleSpan = Omit<
  ReadableSpan,
  "instrumentationScope" | "parentSpanContext"
> &
  LegacyReadableSpan;

const normaliseSpan = (span: ReadableSpan): ReadableSpan => {
  const legacy = span as unknown as FlexibleSpan;

  const needsScope = !legacy.instrumentationScope;
  const needsParent = legacy.parentSpanId && !legacy.parentSpanContext;
  if (!needsScope && !needsParent) {
    return span;
  }

  // Synthesise an "unknown" scope as the last fallback — the OTLP
  // resource-map logic crashes on a missing identifier.
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

  // Spread is safe: `extractReadableSpan` produces a plain object with
  // `spanContext` as an own arrow-function property, not as a prototype
  // method, so we don't lose any callable surface.
  return { ...span, instrumentationScope, parentSpanContext } as ReadableSpan;
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

/**
 * Build the Temporal workflow sink that exports workflow-sandbox spans
 * through the application's OTLP trace exporter, normalising the v1↔v2
 * `ReadableSpan` shape on the way in.
 *
 * The `as unknown as` casts on the exporter and resource arguments are
 * required because `@temporalio/interceptors-opentelemetry@1.x` declares
 * them against `@opentelemetry/sdk-trace-base@1` types, while we run
 * `@2`. They are the only place in our codebase that pins the v1 shape;
 * removing them is the BE-520 deliverable.
 */
export const makeV2WorkflowSink = (
  setup: OpenTelemetrySetup,
): ReturnType<typeof makeWorkflowExporter> =>
  makeWorkflowExporter(
    wrapWorkflowSpanExporter(setup.traceExporter) as unknown as Parameters<
      typeof makeWorkflowExporter
    >[0],
    setup.resource as unknown as Parameters<typeof makeWorkflowExporter>[1],
  );
