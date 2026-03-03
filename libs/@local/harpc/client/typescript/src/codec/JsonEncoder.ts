import { Effect, Layer, pipe, Schema, Stream } from "effect";

import * as Encoder from "./Encoder.js";

interface Options {
  schema: boolean;
}

const encoder = (options: Options) =>
  Encoder.make((input, schema) => {
    const useSchema = options.schema;

    const textEncoder = new TextEncoder();

    const schemaJson = Schema.parseJson(schema);
    const encodeJson = Schema.encode(schemaJson);

    return pipe(
      input,
      Stream.mapEffect((item) =>
        Effect.gen(function* () {
          const json = useSchema
            ? yield* encodeJson(item)
            : JSON.stringify(item);

          const text = `${json}\x1e`;

          const array = textEncoder.encode(text);

          // assertion is necessary because dom libraries don't support `TextEncoder<ArrayBuffer>` yet.
          return array.buffer as unknown as ArrayBuffer;
        }),
      ),
    );
  });

export const layer = Layer.succeed(Encoder.Encoder, encoder({ schema: true }));

/**
 * Like `layer`, but won't invoke the schema encoder, and instead will just use `JSON.stringify`.
 *
 * This means that the resulting stream won't have any transformation applied to it.
 */
export const layerUnchecked = Layer.succeed(
  Encoder.Encoder,
  encoder({ schema: false }),
);
