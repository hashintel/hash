import { Effect, FastCheck, pipe } from "effect";
import { bench, describe } from "vitest";

import { Buffer } from "../../src/wire-protocol/index.js";
import { Request } from "../../src/wire-protocol/models/request/index.js";

// using the same seed ensures that the same request is generated
const request = FastCheck.sample(Request.arbitrary(FastCheck), {
  seed: 1662493168,
  // eslint-disable-next-line unicorn/prevent-abbreviations
  numRuns: 1,
});

describe("request", () => {
  bench("encode request", async () => {
    await Effect.runPromise(
      pipe(
        Buffer.makeWrite(),
        Effect.andThen((buffer) => Request.encode(buffer, request[0]!)),
      ),
    );
  });
});
