import { describe, expect, it } from "vitest";

import {
  parsePetrinautOptimizationResponse,
  PetrinautOptimizationTransportError,
} from "./create-bridge-petrinaut-optimization";

const responseFromChunks = (
  chunks: string[],
  { status = 200, headers }: { status?: number; headers?: HeadersInit } = {},
): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status, ...(headers ? { headers } : {}) },
  );
};

const collect = async (response: Response) => {
  const events = [];
  for await (const event of parsePetrinautOptimizationResponse(response)) {
    events.push(event);
  }
  return events;
};

describe("parsePetrinautOptimizationResponse", () => {
  it("decodes validated events across arbitrary chunks", async () => {
    const response = responseFromChunks([
      '{"type":"started","requested',
      'Trials":2}\n{"type":"trial","trial":0,"parameters":{"rate":0.4},',
      '"objective":3,"state":"complete","best":{"trial":0,"parameters":{"rate":0.4},"objective":3}}\n',
      '{"type":"complete","requestedTrials":2,"completedTrials":1,"prunedTrials":1,"failedTrials":0,"best":{"trial":0,"parameters":{"rate":0.4},"objective":3}}\n',
    ]);

    await expect(collect(response)).resolves.toMatchObject([
      { type: "started", requestedTrials: 2 },
      { type: "trial", trial: 0, objective: 3 },
      { type: "complete", completedTrials: 1, prunedTrials: 1 },
    ]);
  });

  it("passes server-issued sequence numbers through decoded events", async () => {
    const response = responseFromChunks([
      '{"type":"started","requestedTrials":1,"seq":1}\n',
      '{"type":"complete","requestedTrials":1,"completedTrials":1,"prunedTrials":0,"failedTrials":0,"best":null,"seq":2}\n',
    ]);

    await expect(collect(response)).resolves.toMatchObject([
      { type: "started", seq: 1 },
      { type: "complete", seq: 2 },
    ]);
  });

  it("rejects a stream with no terminal event as a protocol error", async () => {
    const response = responseFromChunks([
      '{"type":"started","requestedTrials":2}\n',
    ]);

    await expect(collect(response)).rejects.toMatchObject({
      category: "protocol",
      message: expect.stringContaining("without a terminal event"),
    });
  });

  it("rejects data after a terminal event as a protocol error", async () => {
    const response = responseFromChunks([
      '{"type":"error","code":"failed","message":"nope","retryable":false}\n',
      '{"type":"started","requestedTrials":2}\n',
    ]);

    await expect(collect(response)).rejects.toMatchObject({
      category: "protocol",
      message: expect.stringContaining("after a terminal event"),
    });
  });

  it("rejects a schema-invalid event as a protocol error, not a raw ZodError", async () => {
    // Syntactically valid JSON in the wrong shape. It must take the same
    // classified path as malformed NDJSON, so the provider reconnects and the
    // schema's validation detail never reaches the user.
    const response = responseFromChunks(['{"type":"trial","trial":"first"}\n']);

    const error = await collect(response).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PetrinautOptimizationTransportError);
    expect(error).toMatchObject({
      category: "protocol",
      message: "The optimizer returned an unrecognized event",
    });
  });

  it("carries the response's correlation ids on a mid-stream protocol error", async () => {
    const response = responseFromChunks(
      ['{"type":"started","requestedTrials":2}\n'],
      {
        headers: {
          "x-hash-request-id": "req-2",
          "x-optimization-run-id": "run-2",
        },
      },
    );

    await expect(collect(response)).rejects.toMatchObject({
      category: "protocol",
      hashRequestId: "req-2",
      optimizationRunId: "run-2",
    });
  });

  it("surfaces a structured HTTP error with status and correlation ids", async () => {
    const response = new Response(JSON.stringify({ error: "Not configured" }), {
      status: 503,
      headers: {
        "x-hash-request-id": "req-1",
        "x-optimization-run-id": "run-1",
      },
    });

    const error = await collect(response).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PetrinautOptimizationTransportError);
    expect(error).toMatchObject({
      category: "http",
      httpStatus: 503,
      hashRequestId: "req-1",
      optimizationRunId: "run-1",
      message: "Not configured",
    });
  });
});
