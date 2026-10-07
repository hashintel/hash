// mirror of the Rust test suite

import { describe, it } from "@effect/vitest";
import { Effect, pipe, Schema, Stream } from "effect";

import { Decoder, JsonDecoder } from "../../src/codec/index.js";
import { expectArrayBuffer } from "../wire-protocol/utils.js";

import type { DecodingError } from "../../src/codec/Decoder.js";
import type * as vitest from "vitest";

const decode = Effect.fn("decode")(function* (
  cx: vitest.TestContext,
  text: readonly string[],
) {
  const decoder = yield* Decoder.Decoder;
  const textEncoder = new TextEncoder();

  const schema = Schema.Record(Schema.String, Schema.String);

  const effect = Stream.fromArray(text).pipe(
    Stream.map((input) =>
      expectArrayBuffer(cx, textEncoder.encode(input).buffer),
    ),
    decoder.decode(schema),
    Stream.runCollect,
  );

  // explicit type annotation needed for eslint
  return yield* effect;
});

describe.concurrent("JsonDecoder", () => {
  it.effect("single record in single chunk", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "value"}\x1E';

      const items = yield* decode(cx, [textPayload]);

      cx.expect(items).toMatchObject([{ key: "value" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("multiple records in single chunk", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "value1"}\x1E{"key": "value2"}\x1E';

      const items = yield* decode(cx, [textPayload]);

      cx.expect(items).toMatchObject([{ key: "value1" }, { key: "value2" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("ends with partial record", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "value1"}\x1E{"key": "value2';

      const items = yield* decode(cx, [textPayload]);

      cx.expect(items).toMatchObject([{ key: "value1" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("partial record completed in next chunk", (cx) =>
    Effect.gen(function* () {
      const textPayload = ['{"key": "val', 'ue1"}\x1E'];

      const items = yield* decode(cx, textPayload);

      cx.expect(items).toMatchObject([{ key: "value1" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect(
    "partial record completed in next chunk with another record in the same chunk",
    (cx) =>
      Effect.gen(function* () {
        const textPayload = ['{"key": "val', 'ue1"}\x1E{"key": "value2"}\x1E'];

        const items = yield* decode(cx, textPayload);

        cx.expect(items).toMatchObject([{ key: "value1" }, { key: "value2" }]);
      }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("invalid json", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "valu\x1E';

      // explicit type annotation needed for eslint
      const error: DecodingError | Schema.SchemaError = yield* pipe(
        decode(cx, [textPayload]),
        Effect.flip,
      );

      cx.expect(error.toString()).toMatch(/Expected a valid JSON string/);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );
});
