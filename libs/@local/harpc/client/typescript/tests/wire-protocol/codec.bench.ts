import { Arbitrary, Effect, pipe, Result } from "effect";
import { describe, test } from "vitest";

import { MutableBuffer, MutableBytes } from "../../src/binary/index.js";
import { Request } from "../../src/wire-protocol/models/request/index.js";
import { Response } from "../../src/wire-protocol/models/response/index.js";

// using the same seed ensures that the same request is generated
const request = await Effect.runPromise(
  Arbitrary.sampleEffect(Request.arbitrary, { seed: 1662493168, count: 1 }),
);

const requestEncoded = pipe(
  Request.encode(MutableBuffer.makeWrite(), request[0]!),
  Result.andThen(MutableBuffer.take),
  Result.getOrThrowWith((error) => {
    return error;
  }),
);

const response = await Effect.runPromise(
  Arbitrary.sampleEffect(Response.arbitrary, { seed: 1662493168, count: 1 }),
);

const responseEncoded = pipe(
  Response.encode(MutableBuffer.makeWrite(), response[0]!),
  Result.andThen(MutableBuffer.take),
  Result.getOrThrowWith((error) => {
    return error;
  }),
);

describe("request", () => {
  // eslint-disable-next-line vitest/expect-expect
  test("codec", async ({ bench }) => {
    await bench("encode", () => {
      Request.encode(MutableBuffer.makeWrite(), request[0]!).pipe(
        Result.getOrThrow,
      );
    }).run();

    await bench("decode", () => {
      const buffer = MutableBuffer.makeRead(MutableBytes.from(requestEncoded));

      Request.decode(buffer);
    }).run();
  });
});

describe("response", () => {
  // eslint-disable-next-line vitest/expect-expect
  test("codec", async ({ bench }) => {
    await bench("encode", () => {
      Response.encode(MutableBuffer.makeWrite(), response[0]!).pipe(
        Result.getOrThrow,
      );
    }).run();

    await bench("decode", () => {
      const buffer = MutableBuffer.makeRead(MutableBytes.from(responseEncoded));

      Response.decode(buffer);
    }).run();
  });
});
