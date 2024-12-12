import { describe, it } from "@effect/vitest";
import { Chunk, Effect, pipe, Schema, Stream } from "effect";
import type { ReadonlyRecord } from "effect/Record";

import { Encoder, JsonEncoder } from "../../src/codec/index.js";

const encode = (items: readonly ReadonlyRecord<string, string>[]) =>
  Effect.gen(function* () {
    const encoder = yield* Encoder.Encoder;
    const textDecoder = new TextDecoder();

    const schema = Schema.Record({ key: Schema.String, value: Schema.String });

    return yield* pipe(
      Stream.fromIterable(items),
      encoder.encode(schema),
      Stream.map((buffer) => textDecoder.decode(buffer)),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );
  });

describe.concurrent("JsonEncoder", () => {
  it.effect("single record", (cx) =>
    Effect.gen(function* () {
      const payload = [{ key: "value" }];

      const items = yield* encode(payload);
      cx.expect(items).toMatchObject(['{"key":"value"}\x1E']);
    }).pipe(Effect.provide(JsonEncoder.layer)),
  );

  it.effect("multiple records", (cx) =>
    Effect.gen(function* () {
      const payload = [{ key: "value1" }, { key: "value2" }];

      const items = yield* encode(payload);
      cx.expect(items).toMatchObject([
        '{"key":"value1"}\x1E',
        '{"key":"value2"}\x1E',
      ]);
    }).pipe(Effect.provide(JsonEncoder.layer)),
  );
});
