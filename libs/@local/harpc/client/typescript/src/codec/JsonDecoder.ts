import { Data, Effect, Layer, Option, pipe, Schema, Stream } from "effect";

import * as Decoder from "./Decoder.js";

// 1E is the ASCII record separator character, and is invalid in JSON.
const SEPARATOR = 0x1e;

export class InvalidUtf8Error extends Data.TaggedError("InvalidUtf8Error")<{
  cause: unknown;
}> {
  get message() {
    return "Invalid UTF-8 encoding";
  }
}

export class InvalidJsonError extends Data.TaggedError("InvalidJsonError")<{
  cause: unknown;
}> {
  get message() {
    return "Invalid JSON encoding";
  }
}

const textDecode = (
  decoder: TextDecoder,
  buffer: ArrayBuffer,
  options: { readonly stream: boolean },
) =>
  Effect.try({
    try: () => {
      return decoder.decode(buffer, options);
    },
    catch: (cause) => new InvalidUtf8Error({ cause }),
  }).pipe(Effect.mapError((cause) => new Decoder.DecodingError({ cause })));

const parseJson = <T>(text: string) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown as T,
    catch: (cause) => new InvalidJsonError({ cause }),
  }).pipe(Effect.mapError((cause) => new Decoder.DecodingError({ cause })));

const processArrayBuffer = <T, E, R>(
  buffer: ArrayBuffer,
  decoder: TextDecoder,
  input: string,
  decodeText: Option.Option<(text: string) => Effect.Effect<T, E, R>>,
) =>
  Effect.gen(function* () {
    const items: T[] = [];

    let fragment = input;
    let slice = buffer;

    while (slice.byteLength > 0) {
      const separatorPosition = pipe(
        new Uint8Array(slice),
        (array) => array.findIndex((byte) => byte === SEPARATOR),
        Option.liftPredicate((position) => position >= 0),
      );

      if (Option.isNone(separatorPosition)) {
        fragment += yield* textDecode(decoder, slice, { stream: true });

        return [fragment, items] as const;
      }

      const left = slice.slice(0, separatorPosition.value);
      slice = slice.slice(separatorPosition.value + 1);

      fragment += yield* textDecode(decoder, left, { stream: false });

      if (Option.isSome(decodeText)) {
        items.push(yield* decodeText.value(fragment));
      } else {
        items.push(yield* parseJson<T>(fragment));
      }

      fragment = "";
    }

    return [fragment, items] as const;
  });

interface Options {
  schema: boolean;
}

const decoder = (options: Options) =>
  Decoder.make((input, schema) => {
    const useSchema = options.schema;

    const textDecoder = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    });

    const schemaJson = Schema.parseJson(schema);
    const decodeJson = Schema.decode(schemaJson);

    let fragment = "";

    return pipe(
      input,
      Stream.mapConcatEffect((buffer) =>
        Effect.gen(function* () {
          const [nextFragment, items] = yield* processArrayBuffer(
            buffer,
            textDecoder,
            fragment,
            useSchema ? Option.some(decodeJson) : Option.none(),
          );

          fragment = nextFragment;

          return items;
        }),
      ),
    );
  });

export const layer = Layer.succeed(Decoder.Decoder, decoder({ schema: true }));

/**
 * Like `layer`, but won't invoke the schema decoder, therefore neither transforming or validating the input.
 * `layerUnchecked` simply uses `JSON.parse` on the input.
 */
export const layerUnchecked = Layer.succeed(
  Decoder.Decoder,
  decoder({ schema: false }),
);
