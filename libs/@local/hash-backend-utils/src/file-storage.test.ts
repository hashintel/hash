import { describe, expect, it } from "vitest";

import { readFirstLineOfStream } from "./file-storage.js";

describe("readFirstLineOfStream", () => {
  it("joins a first line split across chunks, and stops reading at its newline", async () => {
    const chunks = ['{"kind":', '"header"}\n{"kind"', ':"event"}\n'];
    let chunksRead = 0;

    const stream: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const chunk = chunks[chunksRead];

          if (chunk === undefined) {
            return Promise.resolve({ done: true, value: undefined });
          }

          chunksRead += 1;
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(chunk),
          });
        },
      }),
    };

    await expect(readFirstLineOfStream(stream)).resolves.toBe(
      '{"kind":"header"}',
    );
    expect(chunksRead).toBe(2);
  });
});
