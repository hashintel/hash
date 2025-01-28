import { Either, FastCheck, pipe } from "effect";
import { bench, describe } from "vitest";

import { MutableBuffer, MutableBytes } from "../../src/binary/index.js";
import { Request } from "../../src/wire-protocol/models/request/index.js";
import { Response } from "../../src/wire-protocol/models/response/index.js";

// using the same seed ensures that the same request is generated
const request = FastCheck.sample(Request.arbitrary(FastCheck), {
  seed: 1662493168,
  // eslint-disable-next-line unicorn/prevent-abbreviations
  numRuns: 1,
});

const requestEncoded = pipe(
  Request.encode(MutableBuffer.makeWrite(), request[0]!),
  Either.andThen(MutableBuffer.take),
  Either.getOrThrowWith((error) => {
    return error;
  }),
);

const response = FastCheck.sample(Response.arbitrary(FastCheck), {
  seed: 1662493168,
  // eslint-disable-next-line unicorn/prevent-abbreviations
  numRuns: 1,
});

const responseEncoded = pipe(
  Response.encode(MutableBuffer.makeWrite(), response[0]!),
  Either.andThen(MutableBuffer.take),
  Either.getOrThrowWith((error) => {
    return error;
  }),
);

describe("request", () => {
  bench("encode", () => {
    Request.encode(MutableBuffer.makeWrite(), request[0]!).pipe(
      Either.getOrThrow,
    );
  });

  bench("decode", () => {
    const buffer = MutableBuffer.makeRead(MutableBytes.from(requestEncoded));

    Request.decode(buffer);
  });
});

describe("response", () => {
  bench("encode", () => {
    Response.encode(MutableBuffer.makeWrite(), response[0]!).pipe(
      Either.getOrThrow,
    );
  });

  bench("decode", () => {
    const buffer = MutableBuffer.makeRead(MutableBytes.from(responseEncoded));

    Response.decode(buffer);
  });
});
