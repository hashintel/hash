import { describe, it } from "@effect/vitest";
import { Effect, Equal } from "effect";

import { MutableBuffer, MutableBytes } from "../../src/binary/index.js";
import { ResponseBegin } from "../../src/wire-protocol/models/response/index.js";

describe.concurrent("roundtrip", () => {
  it.effect.prop(
    "roundtrip response-begin",
    { begin: ResponseBegin.arbitrary },
    ({ begin }, cx) =>
      Effect.gen(function* () {
        const write = MutableBuffer.makeWrite();

        yield* Effect.fromResult(ResponseBegin.encode(write, begin));

        const read = MutableBuffer.makeRead(
          MutableBytes.from(MutableBuffer.take(write)),
        );
        const received = yield* Effect.fromResult(ResponseBegin.decode(read));

        cx.expect(Equal.equals(received, begin)).toBeTruthy();
      }),
  );
});
