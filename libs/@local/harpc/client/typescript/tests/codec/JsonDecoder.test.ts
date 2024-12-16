// mirror of the Rust test suite

import { describe, it } from "@effect/vitest";
import { Chunk, Effect, pipe, Schema, Stream } from "effect";
import type { ParseError } from "effect/ParseResult";
import type { ReadonlyRecord } from "effect/Record";
import type * as vitest from "vitest";

import type { DecodingError } from "../../src/codec/Decoder.js";
import { Decoder, JsonDecoder } from "../../src/codec/index.js";
import { expectArrayBuffer } from "../wire-protocol/utils.js";

const decode = (
  cx: vitest.TaskContext<vitest.RunnerTestCase<object>> & vitest.TestContext,
  text: readonly string[],
) =>
  Effect.gen(function* () {
    const decoder = yield* Decoder.Decoder;
    const textEncoder = new TextEncoder();

    const schema = Schema.Record({ key: Schema.String, value: Schema.String });

    const effect = Stream.fromChunk(Chunk.fromIterable(text)).pipe(
      Stream.map((input) =>
        expectArrayBuffer(cx, textEncoder.encode(input).buffer),
      ),
      decoder.decode(schema),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );

    // explicit type annotation needed for eslint
    return (yield* effect) as readonly ReadonlyRecord<string, string>[];
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
      const error: DecodingError | ParseError = yield* pipe(
        decode(cx, [textPayload]),
        Effect.flip,
      );

      cx.expect(error.toString()).toMatch(
        /Unterminated string in JSON at position 13/,
      );
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );
});
