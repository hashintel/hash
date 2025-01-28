import { Effect, FastCheck, pipe } from "effect";
import { bench, describe } from "vitest";

import { Buffer } from "../../src/wire-protocol/index.js";
import { Request } from "../../src/wire-protocol/models/request/index.js";
import { Response } from "../../src/wire-protocol/models/response/index.js";

// using the same seed ensures that the same request is generated
const request = FastCheck.sample(Request.arbitrary(FastCheck), {
  seed: 1662493168,
  // eslint-disable-next-line unicorn/prevent-abbreviations
  numRuns: 1,
});

const requestEncoded = Effect.runSync(
  pipe(
    Buffer.makeWrite(),
    Effect.andThen((buffer) => Request.encode(buffer, request[0]!)),
    Effect.andThen(Buffer.take),
  ),
);

const response = FastCheck.sample(Response.arbitrary(FastCheck), {
  seed: 1662493168,
  // eslint-disable-next-line unicorn/prevent-abbreviations
  numRuns: 1,
});

const responseEncoded = Effect.runSync(
  pipe(
    Buffer.makeWrite(),
    Effect.andThen((buffer) => Response.encode(buffer, response[0]!)),
    Effect.andThen(Buffer.take),
  ),
);

describe("request", () => {
  bench("encode", async () => {
    await Effect.runPromise(
      pipe(
        Buffer.makeWrite(),
        Effect.andThen((buffer) => Request.encode(buffer, request[0]!)),
      ),
    );
  });

  bench("decode", async () => {
    await Effect.runPromise(
      pipe(
        Buffer.makeRead(new DataView(requestEncoded)),
        Effect.andThen((buffer) => Request.decode(buffer)),
      ),
    );
  });
});

describe("response", () => {
  bench("encode", async () => {
    await Effect.runPromise(
      pipe(
        Buffer.makeWrite(),
        Effect.andThen((buffer) => Response.encode(buffer, response[0]!)),
      ),
    );
  });

  bench("decode", async () => {
    await Effect.runPromise(
      pipe(
        Buffer.makeRead(new DataView(responseEncoded)),
        Effect.andThen((buffer) => Response.decode(buffer)),
      ),
    );
  });
});
