import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import { wrapWorkflowSpanExporter } from "./workflow-span-adapter.js";

/**
 * Recording exporter that captures the spans handed to it without
 * actually exporting anywhere. Used to assert that the adapter
 * produces v2-shaped spans before the OTLP transformer sees them.
 */
const recordingExporter = (): {
  exporter: SpanExporter;
  exported: ReadableSpan[];
} => {
  const exported: ReadableSpan[] = [];
  return {
    exported,
    exporter: {
      export: (spans, callback) => {
        exported.push(...spans);
        callback({ code: 0 });
      },
      shutdown: () => Promise.resolve(),
      forceFlush: () => Promise.resolve(),
    },
  };
};

/**
 * Build a v1-shaped Temporal span. Mirrors the shape that
 * `@temporalio/interceptors-opentelemetry`'s `extractReadableSpan`
 * produces: `instrumentationLibrary` (not `instrumentationScope`) and
 * `parentSpanId` (not `parentSpanContext`).
 */
const v1Span = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    name: "RunWorkflow:exampleWorkflow",
    spanContext: () => ({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
    }),
    instrumentationLibrary: { name: "@temporalio/interceptor-workflow" },
    parentSpanId: "00f067aa0ba902b7",
    ...overrides,
  }) as unknown as ReadableSpan;

describe("wrapWorkflowSpanExporter / normaliseSpan", () => {
  it("synthesises instrumentationScope from instrumentationLibrary", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    wrapped.export([v1Span()], () => {});

    expect(exported).toHaveLength(1);
    expect(exported[0]!.instrumentationScope).toEqual({
      name: "@temporalio/interceptor-workflow",
    });
  });

  it("synthesises parentSpanContext from parentSpanId, marking parent remote", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    wrapped.export([v1Span()], () => {});

    const ctx = exported[0]!.parentSpanContext;
    expect(ctx).toEqual({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "00f067aa0ba902b7",
      traceFlags: 1,
      isRemote: true,
    });
  });

  it("falls back to an 'unknown' scope when both legacy and v2 fields are missing", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    wrapped.export(
      [v1Span({ instrumentationLibrary: undefined, parentSpanId: undefined })],
      () => {},
    );

    expect(exported[0]!.instrumentationScope).toEqual({ name: "unknown" });
    expect(exported[0]!.parentSpanContext).toBeUndefined();
  });

  it("leaves a span with no parent untouched on the parent field", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    wrapped.export([v1Span({ parentSpanId: undefined })], () => {});

    expect(exported[0]!.parentSpanContext).toBeUndefined();
  });

  it("passes through spans that are already v2-shaped", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    const scope = { name: "@opentelemetry/sdk-trace-node" };
    const parentSpanContext = {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "00f067aa0ba902b7",
      traceFlags: 1,
      isRemote: false,
    };
    const v2 = {
      ...v1Span(),
      instrumentationLibrary: undefined,
      parentSpanId: undefined,
      instrumentationScope: scope,
      parentSpanContext,
    } as unknown as ReadableSpan;

    wrapped.export([v2], () => {});

    expect(exported[0]).toBe(v2);
  });

  it("preserves attributes, events, kind, and `spanContext()` callability", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    const ctx = {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
    };
    const events = [{ name: "evt", time: [0, 0], attributes: { x: 1 } }];
    const links = [{ context: ctx }];
    const span = v1Span({
      kind: 1,
      attributes: { "service.name": "x" },
      events,
      links,
      startTime: [123, 0],
      endTime: [124, 0],
      duration: [1, 0],
      ended: true,
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
      spanContext: () => ctx,
    });

    wrapped.export([span], () => {});

    const out = exported[0]!;
    expect(out.kind).toBe(1);
    expect(out.attributes).toEqual({ "service.name": "x" });
    expect(out.events).toBe(events);
    expect(out.links).toBe(links);
    expect(out.duration).toEqual([1, 0]);
    expect(out.ended).toBe(true);
    // The arrow-function `spanContext` is an own property in
    // `extractReadableSpan`'s output. Spreading must keep it callable
    // — the OTLP transformer reads `span.spanContext().spanId`.
    expect(out.spanContext()).toEqual(ctx);
  });

  it("treats parentSpanId === '' as 'no parent' rather than synthesising an empty span ID", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    wrapped.export([v1Span({ parentSpanId: "" })], () => {});

    // Empty string is falsy, so `needsParent` short-circuits; an
    // explicit "" must not become `parentSpanContext.spanId === ""` on
    // the wire (which Tempo would interpret as a malformed parent).
    expect(exported[0]!.parentSpanContext).toBeUndefined();
  });

  it("does not overwrite an existing parentSpanContext when legacy parentSpanId is also set", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    const existing = {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "ffffffffffffffff",
      traceFlags: 1,
      isRemote: false,
    };
    wrapped.export(
      [
        v1Span({
          parentSpanId: "00f067aa0ba902b7",
          parentSpanContext: existing,
        }),
      ],
      () => {},
    );

    // v2 field wins — the adapter is meant to *fill in* gaps, not
    // overwrite a context that's already present.
    expect(exported[0]!.parentSpanContext).toBe(existing);
  });

  it("normalises a mixed v1 / v2 batch per-span", () => {
    const { exporter, exported } = recordingExporter();
    const wrapped = wrapWorkflowSpanExporter(exporter);

    const v1 = v1Span();
    const v2 = {
      ...v1Span(),
      instrumentationLibrary: undefined,
      parentSpanId: undefined,
      instrumentationScope: { name: "v2-scope" },
    } as unknown as ReadableSpan;

    wrapped.export([v1, v2, v1Span({ parentSpanId: undefined })], () => {});

    expect(exported).toHaveLength(3);
    expect(exported[0]!.instrumentationScope).toEqual({
      name: "@temporalio/interceptor-workflow",
    });
    expect(exported[1]).toBe(v2);
    expect(exported[2]!.parentSpanContext).toBeUndefined();
  });

  it("propagates the inner exporter's result code to the outer callback", async () => {
    const failing = {
      export: (
        _spans: ReadableSpan[],
        cb: (result: { code: number; error?: Error }) => void,
      ) => cb({ code: 1, error: new Error("downstream failed") }),
      shutdown: () => Promise.resolve(),
      forceFlush: () => Promise.resolve(),
    };
    const wrapped = wrapWorkflowSpanExporter(failing);

    const result = await new Promise<{ code: number; error?: Error }>(
      (resolve) => {
        wrapped.export([v1Span()], resolve);
      },
    );

    expect(result.code).toBe(1);
    expect(result.error?.message).toBe("downstream failed");
  });

  it("delegates shutdown and forceFlush to the inner exporter", async () => {
    let shutdownCalls = 0;
    let flushCalls = 0;
    const inner: SpanExporter = {
      export: (_, cb) => cb({ code: 0 }),
      shutdown: () => {
        shutdownCalls += 1;
        return Promise.resolve();
      },
      forceFlush: () => {
        flushCalls += 1;
        return Promise.resolve();
      },
    };
    const wrapped = wrapWorkflowSpanExporter(inner);

    await wrapped.shutdown();
    await wrapped.forceFlush!();

    expect(shutdownCalls).toBe(1);
    expect(flushCalls).toBe(1);
  });
});
