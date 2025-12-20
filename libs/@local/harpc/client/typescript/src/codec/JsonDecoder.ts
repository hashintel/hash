import { TextDecoder } from "node:util";

import { Data, Effect, Layer, Option, pipe, Schema, Stream } from "effect";

import { InvalidUtf8Error } from "../ClientError.js";

import * as Decoder from "./Decoder.js";

// 1E is the ASCII record separator character, and is invalid in JSON.
const SEPARATOR = 0x1e;

export class InvalidJsonError extends Data.TaggedError("InvalidJsonError")<{
  cause: unknown;
}> {
  get message() {
    return "Invalid JSON encoding";
  }
}

interface TextDecodeOptions {
  readonly stream: boolean;
}

const textDecode = (
  decoder: TextDecoder,
  buffer: ArrayBuffer,
  options: TextDecodeOptions,
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

const processArrayBuffer = Effect.fn("processArrayBuffer")(function* <T, E, R>(
  buffer: ArrayBuffer,
  decoder: TextDecoder,
  input: string,
  decodeText: Option.Option<(text: string) => Effect.Effect<T, E, R>>,
) {
  const items: T[] = [];

  let fragment = input;
  let slice = buffer;

  while (slice.byteLength > 0) {
    const separatorPosition = pipe(
      new Uint8Array(slice),
      (array) => array.indexOf(SEPARATOR),
      Option.liftPredicate((position) => position >= 0),
    );

    if (Option.isNone(separatorPosition)) {
      fragment =
        fragment + (yield* textDecode(decoder, slice, { stream: true }));

      return [fragment, items] as const;
    }

    const left = slice.slice(0, separatorPosition.value);

    slice = slice.slice(separatorPosition.value + 1);

    fragment = fragment + (yield* textDecode(decoder, left, { stream: false }));

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

const make = (options: Options) =>
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

          // eslint-disable-next-line require-atomic-updates -- this is correct, as the stream runs sequentially
          fragment = nextFragment;

          return items;
        }),
      ),
    );
  });

export const layer = Layer.succeed(Decoder.Decoder, make({ schema: true }));

/**
 * Like `layer`, but won't invoke the schema decoder, therefore neither transforming or validating the input.
 * `layerUnchecked` simply uses `JSON.parse` on the input.
 */
export const layerUnchecked = Layer.succeed(
  Decoder.Decoder,
  make({ schema: false }),
);
