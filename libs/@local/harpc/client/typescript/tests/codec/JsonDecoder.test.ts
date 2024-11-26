// mirror of the Rust test suite

import { describe, it } from "@effect/vitest";
import { Chunk, Effect, pipe, Schema, Stream } from "effect";

import { Decoder, JsonDecoder } from "../../src/codec/index.js";

const decode = (text: readonly string[]) =>
  Effect.gen(function* () {
    const decoder = yield* Decoder.Decoder;
    const textEncoder = new TextEncoder();

    const schema = Schema.Record({ key: Schema.String, value: Schema.String });

    return yield* pipe(
      Stream.fromIterable(text),
      Stream.map((input) => textEncoder.encode(input).buffer),
      decoder.decode(schema),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );
  });

describe.concurrent("JsonDecoder", () => {
  it.effect("single record in single chunk", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "value"}\x1E';

      const items = yield* decode([textPayload]);
      cx.expect(items).toMatchObject([{ key: "value" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("multiple records in single chunk", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "value1"}\x1E{"key": "value2"}\x1E';

      const items = yield* decode([textPayload]);
      cx.expect(items).toMatchObject([{ key: "value1" }, { key: "value2" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("ends with partial record", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "value1"}\x1E{"key": "value2';

      const items = yield* decode([textPayload]);
      cx.expect(items).toMatchObject([{ key: "value1" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("partial record completed in next chunk", (cx) =>
    Effect.gen(function* () {
      const textPayload = ['{"key": "val', 'ue1"}\x1E'];

      const items = yield* decode(textPayload);
      cx.expect(items).toMatchObject([{ key: "value1" }]);
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect(
    "partial record completed in next chunk with another record in the same chunk",
    (cx) =>
      Effect.gen(function* () {
        const textPayload = ['{"key": "val', 'ue1"}\x1E{"key": "value2"}\x1E'];

        const items = yield* decode(textPayload);
        cx.expect(items).toMatchObject([{ key: "value1" }, { key: "value2" }]);
      }).pipe(Effect.provide(JsonDecoder.layer)),
  );

  it.effect("invalid json", (cx) =>
    Effect.gen(function* () {
      const textPayload = '{"key": "valu\x1E';

      const error = yield* pipe(decode([textPayload]), Effect.flip);
      cx.expect(error.toString()).toMatch(
        /Unterminated string in JSON at position 13/,
      );
    }).pipe(Effect.provide(JsonDecoder.layer)),
  );
});
