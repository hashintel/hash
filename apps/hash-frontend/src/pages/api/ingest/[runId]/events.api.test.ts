import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import handler from "./events.api";

const encoder = new TextEncoder();
const decodeChunks = (chunks: Uint8Array[]) =>
  Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");

class MockRequest extends EventEmitter {
  public method = "GET";
  public query: Record<string, string | string[] | undefined>;
  public headers: Record<string, string | string[] | undefined> = {};

  constructor(query: Record<string, string | string[] | undefined>) {
    super();
    this.query = query;
  }
}

class MockResponse extends EventEmitter {
  public headersSent = false;
  public writableEnded = false;
  public statusCode = 200;
  public readonly headers: Record<string, string> = {};
  public readonly writes: Uint8Array[] = [];
  public jsonBody: unknown;

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: unknown) {
    this.jsonBody = body;
    this.headersSent = true;
    this.writableEnded = true;
    return this;
  }

  writeHead(statusCode: number, headers: Record<string, string>) {
    this.statusCode = statusCode;
    Object.assign(this.headers, headers);
    this.headersSent = true;
  }

  flushHeaders() {
    this.headersSent = true;
  }

  write(chunk: Uint8Array) {
    this.writes.push(chunk);
    return true;
  }

  end(chunk?: Uint8Array) {
    if (chunk) {
      this.write(chunk);
    }

    this.writableEnded = true;
    this.emit("finish");
  }
}

const flushAsync = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe("ingest events api route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams live SSE chunks through to the client response", async () => {
    let enqueueChunk: (chunk: string) => void = (_chunk: string) => {
      throw new Error("Expected stream controller to be initialized");
    };
    let closeStream: () => void = () => {
      throw new Error("Expected stream controller to be initialized");
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(streamController) {
                enqueueChunk = (chunk) => {
                  streamController.enqueue(encoder.encode(chunk));
                };
                closeStream = () => {
                  streamController.close();
                };
              },
            }),
            {
              status: 200,
              headers: { "content-type": "text/event-stream; charset=utf-8" },
            },
          ),
      ),
    );

    const req = new MockRequest({ runId: "run-123" });
    const res = new MockResponse();

    const handlerPromise = handler(req as never, res as never);
    await flushAsync();

    enqueueChunk('event: phase-start\ndata: {"status":"running"}\n\n');
    await flushAsync();

    expect(decodeChunks(res.writes)).toContain("event: phase-start");
    expect(res.writableEnded).toBe(false);

    enqueueChunk('event: run-succeeded\ndata: {"status":"succeeded"}\n\n');
    closeStream();

    await handlerPromise;

    expect(decodeChunks(res.writes)).toContain("event: run-succeeded");
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/event-stream");
    expect(res.writableEnded).toBe(true);
  });

  it("keeps the upstream stream alive through request close until upstream completes", async () => {
    let enqueueChunk: (chunk: string) => void = (_chunk: string) => {
      throw new Error("Expected stream controller to be initialized");
    };
    let closeStream: () => void = () => {
      throw new Error("Expected stream controller to be initialized");
    };
    const cancelSpy = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(streamController) {
                enqueueChunk = (chunk) => {
                  streamController.enqueue(encoder.encode(chunk));
                };
                closeStream = () => {
                  streamController.close();
                };
              },
              cancel(reason) {
                cancelSpy(reason);
              },
            }),
            {
              status: 200,
              headers: { "content-type": "text/event-stream; charset=utf-8" },
            },
          ),
      ),
    );

    const req = new MockRequest({ runId: "run-123" });
    const res = new MockResponse();

    const handlerPromise = handler(req as never, res as never);
    await flushAsync();

    req.emit("close");
    await flushAsync();

    enqueueChunk('event: run-succeeded\ndata: {"status":"succeeded"}\n\n');
    closeStream();

    await handlerPromise;

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(decodeChunks(res.writes)).toContain("event: run-succeeded");
    expect(res.writableEnded).toBe(true);
  });

  it("aborts the upstream stream when the client disconnects before completion", async () => {
    let cancelResolve!: () => void;
    const cancelPromise = new Promise<void>((resolve) => {
      cancelResolve = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start() {},
              cancel() {
                cancelResolve();
              },
            }),
            {
              status: 200,
              headers: { "content-type": "text/event-stream; charset=utf-8" },
            },
          ),
      ),
    );

    const req = new MockRequest({ runId: "run-123" });
    const res = new MockResponse();

    const handlerPromise = handler(req as never, res as never);
    await flushAsync();

    res.emit("close");

    await cancelPromise;
    await handlerPromise;

    expect(res.writableEnded).toBe(true);
  });
});
