import { Data, Effect, Option, pipe, Stream } from "effect";

import { MutableBytes, MutableBuffer } from "../../binary/index.js";
import { Response } from "../models/response/index.js";

export class IncompleteResponseError extends Data.TaggedError(
  "IncompleteResponseError",
)<{
  length: number;
}> {
  get message() {
    return `Underlying stream ended with ${this.length} bytes remaining, which could not be decoded into a complete response.`;
  }
}

/**
 * Initial scratch buffer is 2x size of the largest possible packet.
 */
const makeScratch = () =>
  MutableBytes.make({
    initialCapacity: 2 * 1024 * 64,
    growthStrategy: "doubling",
  });

const tryDecodePacket = Effect.fn("tryDecodePacket")(function* (
  scratch: MutableBytes.MutableBytes,
) {
  // The length marker is always at bytes 30 and 31
  if (MutableBytes.length(scratch) < 32) {
    return Option.none();
  }

  // length is encoded as a 16-bit unsigned integer, big-endian
  const bufferView = new DataView(MutableBytes.asBuffer(scratch), 30, 2);
  const packetLength = bufferView.getUint16(0, false);

  const split = MutableBytes.splitTo(scratch, packetLength + 32);

  if (Option.isNone(split)) {
    // we cannot yet read the full message
    return Option.none();
  }

  const packet = split.value;

  // decode the message
  const reader = MutableBuffer.makeRead(packet);
  const response = yield* Response.decode(reader);

  return Option.some(response);
});

const tryDecode = Effect.fn("tryDecode")(function* (
  scratch: MutableBytes.MutableBytes,
) {
  let shouldContinue = true;
  const output: Response.Response[] = [];

  while (shouldContinue) {
    const result = yield* tryDecodePacket(scratch);

    shouldContinue = Option.match(result, {
      onNone: () => false,
      onSome: (response) => {
        output.push(response);

        return true;
      },
    });
  }

  return output;
});

export const make = <E, R>(
  stream: Stream.Stream<ArrayBuffer, E, R>,
): Stream.Stream<
  Response.Response,
  E | Response.DecodeError | IncompleteResponseError,
  R
> => {
  const scratch = makeScratch();

  return pipe(
    stream,
    Stream.tap((chunk) => {
      // hex view of the chunk (trying to decode characters as string if possible)
      const hexView = [...new Uint8Array(chunk)]
        .map((byte) => {
          const char = String.fromCharCode(byte);

          return char.match(/[a-z0-9]/i)
            ? char
            : `0x${byte.toString(16).padStart(2, "0")}`;
        })
        .join(" ");

      return Effect.logTrace(`Received chunk: ${hexView}`);
    }),
    Stream.mapConcatEffect((chunk) =>
      Effect.gen(function* () {
        MutableBytes.appendBuffer(scratch, chunk);

        return yield* tryDecode(scratch);
      }),
    ),
    Stream.concat(
      Stream.fromIterableEffect(
        Effect.suspend(() =>
          Effect.gen(function* () {
            // we don't need to `tryDecode` here again, because anytime we receive a value, we try to decode as much as possible.
            if (MutableBytes.length(scratch) > 0) {
              yield* new IncompleteResponseError({
                length: MutableBytes.length(scratch),
              });
            }

            return [];
          }),
        ),
      ),
    ),
  );
};
