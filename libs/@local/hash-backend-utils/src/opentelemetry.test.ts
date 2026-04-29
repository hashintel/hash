import type { ClientRequest, IncomingMessage } from "node:http";

import { type Span, trace } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";

import {
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
