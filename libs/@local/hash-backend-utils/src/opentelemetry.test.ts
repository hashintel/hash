import type { ClientRequest, IncomingMessage } from "node:http";

import { type Span, trace } from "@opentelemetry/api";
import type { HttpInstrumentationConfig } from "@opentelemetry/instrumentation-http";
import { describe, expect, it } from "vitest";

import {
  createHttpInstrumentation,
  httpRequestSpanNameHook,
  resolvePeerService,
} from "./opentelemetry.js";

describe("resolvePeerService", () => {
  it("matches exact hosts to their service label", () => {
    expect(resolvePeerService("api.openai.com")).toBe("OpenAI");
    expect(resolvePeerService("api.anthropic.com")).toBe("Anthropic");
    expect(resolvePeerService("api.linear.app")).toBe("Linear");
  });

  it("matches suffix rules for subdomains", () => {
    expect(resolvePeerService("bigquery.googleapis.com")).toBe("Google Cloud");
    expect(resolvePeerService("aiplatform.googleapis.com")).toBe(
      "Google Cloud",
    );
  });

  it("does not match a suffix rule against the bare domain", () => {
    // `.googleapis.com` (with leading dot) only matches if the host
    // ends with that — `googleapis.com` itself does not.
    expect(resolvePeerService("googleapis.com")).toBeUndefined();
  });

  it("does not match unrelated hosts", () => {
    expect(resolvePeerService("example.com")).toBeUndefined();
    expect(resolvePeerService("openai.com")).toBeUndefined();
    expect(resolvePeerService("anthropic.com")).toBeUndefined();
  });

  it("does not match a substring inside a host segment", () => {
    expect(resolvePeerService("not-api.openai.com.evil.test")).toBeUndefined();
  });

  // Suffix rules use `.endsWith(rule.suffix)` with the leading dot, so a
  // host that happens to share the suffix without the dot boundary
  // (e.g. `evilgoogleapis.com`) must not match. This is the property
  // that prevents lookalike-domain attribution.
  it("requires the suffix dot boundary", () => {
    expect(resolvePeerService("evilgoogleapis.com")).toBeUndefined();
    expect(resolvePeerService("googleapis.com.evil.test")).toBeUndefined();
  });
});

describe("httpRequestSpanNameHook", () => {
  /**
   * Build a recording span with a mutable `updateName` capture so the
   * hook's effect can be asserted without a full TracerProvider.
   */
  const makeSpan = (): { span: Span; updates: string[] } => {
    const updates: string[] = [];
    const noopSpan = trace.getTracer("test").startSpan("noop");
    const span: Span = Object.assign(noopSpan, {
      updateName: (name: string) => {
        updates.push(name);
        return span;
      },
    });
    return { span, updates };
  };

  it("renames incoming requests to METHOD /path", () => {
    const { span, updates } = makeSpan();
    const incoming = {
      method: "GET",
      url: "/api/v1/widgets",
    } as Partial<IncomingMessage>;

    httpRequestSpanNameHook(span, incoming as IncomingMessage);

    expect(updates).toEqual(["GET /api/v1/widgets"]);
  });

  it("prefers Express's `originalUrl` over `url` when both are present", () => {
    const { span, updates } = makeSpan();
    const incoming = {
      method: "POST",
      originalUrl: "/graphql",
      url: "/", // Express rewrites url after route matching
    } as Partial<IncomingMessage> & { originalUrl: string };

    httpRequestSpanNameHook(
      span,
      incoming as IncomingMessage & { originalUrl: string },
    );

    expect(updates).toEqual(["POST /graphql"]);
  });

  it("renames outgoing requests using `path`", () => {
    const { span, updates } = makeSpan();
    const outgoing = {
      method: "POST",
      path: "/v1/embeddings",
    } as unknown as ClientRequest;

    httpRequestSpanNameHook(span, outgoing);

    expect(updates).toEqual(["POST /v1/embeddings"]);
  });

  it("strips query string to keep cardinality bounded", () => {
    const { span, updates } = makeSpan();
    httpRequestSpanNameHook(span, {
      method: "GET",
      url: "/search?q=secret&page=2",
    } as IncomingMessage);

    expect(updates).toEqual(["GET /search"]);
  });

  it("does nothing when method is missing", () => {
    const { span, updates } = makeSpan();
    httpRequestSpanNameHook(span, {
      url: "/api/widgets",
    } as IncomingMessage);

    expect(updates).toEqual([]);
  });

  it("does nothing when no path source is available", () => {
    const { span, updates } = makeSpan();
    httpRequestSpanNameHook(span, { method: "GET" } as IncomingMessage);

    expect(updates).toEqual([]);
  });
});

describe("createHttpInstrumentation OTLP-port filter", () => {
  /**
   * Read the configured `ignoreOutgoingRequestHook` back off the
   * instrumentation. Without this, a regression that drops the filter
   * would only show up at runtime as exporter traffic feeding back into
   * itself, amplifying span volume per export batch.
   */
  const ignoreOutgoingFor = (otlpEndpoint: string) => {
    const config = createHttpInstrumentation(
      otlpEndpoint,
    ).getConfig() as HttpInstrumentationConfig;
    const hook = config.ignoreOutgoingRequestHook;
    if (!hook) {
      throw new Error("ignoreOutgoingRequestHook should be set");
    }
    return (port: number | undefined) =>
      hook({ port } as Parameters<NonNullable<typeof hook>>[0]);
  };

  it("ignores outgoing requests to the configured OTLP gRPC port", () => {
    const ignored = ignoreOutgoingFor("http://collector:4317");
    expect(ignored(4317)).toBe(true);
    expect(ignored(443)).toBe(false);
  });

  it("derives a non-default OTLP port from the endpoint URL", () => {
    // `:4318` is the OTLP/HTTP convention; if the helper hardcoded 4317
    // a self-instrumented exporter on 4318 would feed back into itself.
    const ignored = ignoreOutgoingFor("http://collector:4318");
    expect(ignored(4318)).toBe(true);
    expect(ignored(4317)).toBe(false);
  });

  it("falls back to 4317 when the endpoint has no explicit port", () => {
    const ignored = ignoreOutgoingFor("http://collector");
    expect(ignored(4317)).toBe(true);
    expect(ignored(8080)).toBe(false);
  });

  it("falls back to 4317 when the endpoint is malformed", () => {
    // Bad URL must not throw on every outgoing request — that would
    // disable HTTP tracing entirely. Falling back to 4317 keeps the
    // tracer running; `registerOpenTelemetry` surfaces the URL error
    // separately when it builds the exporter.
    const ignored = ignoreOutgoingFor("not a url");
    expect(ignored(4317)).toBe(true);
    expect(ignored(443)).toBe(false);
  });
});
