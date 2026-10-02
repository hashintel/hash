import { Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import handler from "./events.api";

import type { NextApiRequest, NextApiResponse } from "next";

class MockResponse extends Writable {
  public statusCode = 200;
  public readonly headers: Record<string, string> = {};
  public readonly chunks: Buffer[] = [];

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: () => void,
  ) {
    this.chunks.push(chunk);
    callback();
  }

  writeHead(statusCode: number, headers: Record<string, string>) {
    this.statusCode = statusCode;
    Object.assign(this.headers, headers);
    return this;
  }

  status(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }

  get body() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

const callHandler = (
  request: Partial<NextApiRequest>,
  response: MockResponse,
) =>
  handler(
    { query: {}, headers: {}, ...request } as NextApiRequest,
    response as unknown as NextApiResponse,
  );

describe("ingest events api route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("streams the upstream event stream, forwarding the resume position", async () => {
    vi.stubEnv("MASTRA_API_ORIGIN", "http://mastra.test");
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response("id: 3\nevent: run-succeeded\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = new MockResponse();

    await callHandler(
      {
        query: { runId: "run/1", after: "0" },
        headers: { "last-event-id": "2" },
      },
      response,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://mastra.test/ingest-runs/run%2F1/events?after=0"),
      { headers: { Accept: "text/event-stream", "Last-Event-ID": "2" } },
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("text/event-stream");
    expect(response.body).toContain("event: run-succeeded");
    expect(response.writableFinished).toBe(true);
  });

  it("cancels the upstream stream when the client disconnects", async () => {
    vi.stubEnv("MASTRA_API_ORIGIN", "http://mastra.test");
    const cancelled = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(new ReadableStream({ cancel: cancelled }), {
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      ),
    );
    const response = new MockResponse();

    const handled = callHandler({ query: { runId: "run-1" } }, response);
    await vi.waitFor(() => expect(response.statusCode).toBe(200));
    response.destroy();
    await handled;

    expect(cancelled).toHaveBeenCalled();
  });

  it("does not exist unless a Mastra API origin is configured", async () => {
    vi.stubEnv("MASTRA_API_ORIGIN", "");
    const response = new MockResponse();
    response.end = vi.fn() as never;

    await callHandler({ query: { runId: "run-1" } }, response);

    expect(response.statusCode).toBe(404);
  });
});
