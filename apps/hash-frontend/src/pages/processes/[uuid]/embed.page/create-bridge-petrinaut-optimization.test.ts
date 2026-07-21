import { describe, expect, it } from "vitest";

import { parsePetrinautOptimizationResponse } from "./create-bridge-petrinaut-optimization";

const responseFromChunks = (chunks: string[], status = 200): Response => {
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
    { status },
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

  it("rejects a stream with no terminal event", async () => {
    const response = responseFromChunks([
      '{"type":"started","requestedTrials":2}\n',
    ]);

    await expect(collect(response)).rejects.toThrow("without a terminal event");
  });

  it("rejects data after a terminal event", async () => {
    const response = responseFromChunks([
      '{"type":"error","code":"failed","message":"nope","retryable":false}\n',
      '{"type":"started","requestedTrials":2}\n',
    ]);

    await expect(collect(response)).rejects.toThrow("after a terminal event");
  });

  it("surfaces a structured HTTP error", async () => {
    const response = new Response(JSON.stringify({ error: "Not configured" }), {
      status: 503,
    });

    await expect(collect(response)).rejects.toThrow("Not configured");
  });
});
