import { Data, Effect, Either, Number, pipe, Stream, Streamable } from "effect";

import * as Buffer from "../Buffer.js";
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

interface Scratch {
  buffer: ArrayBuffer;
  length: number;
}

// initial scratch buffer is 2x size of the largest possible packet
const makeScratch = (): Scratch => ({
  buffer: new ArrayBuffer(2 * 1024 * 64),
  length: 0,
});

const pushScratch = (scratch: Scratch, that: ArrayBuffer): Scratch => {
  if (scratch.length + that.byteLength > scratch.buffer.byteLength) {
    // allocate a new buffer, the new buffer is `max(2x current buffer, current buffer + new buffer)`, allows us to cut down on allocations
    const buffer = new ArrayBuffer(
      Number.max(
        2 * scratch.buffer.byteLength,
        scratch.length + that.byteLength,
      ),
    );

    const view = new Uint8Array(buffer);
    view.set(new Uint8Array(scratch.buffer, 0, scratch.length));
    view.set(new Uint8Array(that), scratch.length);

    return { buffer, length: scratch.length + that.byteLength };
  } else {
    const view = new Uint8Array(scratch.buffer);
    view.set(new Uint8Array(that), scratch.length);

    return { buffer: scratch.buffer, length: scratch.length + that.byteLength };
  }
};

/**
 * Split the scratch space, so that scratch contains `[at,length)` and the rest is returned as a new scratch space
 */
const splitToScratch = (
  scratch: Scratch,
  at: number,
): Either.Either<[ArrayBuffer, Scratch], Scratch> => {
  if (at > scratch.length) {
    return Either.left(scratch);
  }

  const buffer = new ArrayBuffer(at);
  const bufferView = new Uint8Array(buffer);
  bufferView.set(new Uint8Array(scratch.buffer, 0, at));

  // shift rest of the buffer to the beginning
  const scratchView = new Uint8Array(scratch.buffer);
  scratchView.copyWithin(0, at, scratch.length);

  return Either.right([
    buffer,
    { buffer: scratch.buffer, length: scratch.length - at },
  ]);
};

const tryDecodePacket = (scratch: Scratch) =>
  Effect.gen(function* () {
    // The length marker is always at bytes 30 and 31
    if (scratch.length >= 32) {
      return Either.left(scratch);
    }

    // length is encoded as a 16-bit unsigned integer, big-endian
    const bufferView = new DataView(scratch.buffer, 30, 2);
    const packetLength = bufferView.getUint16(0, false);

    const split = splitToScratch(scratch, packetLength + 32);
    if (Either.isLeft(split)) {
      // we cannot yet read the full message
      return Either.left(scratch);
    }

    const [packet, remaining] = split.right;

    // decode the message
    const reader = yield* Buffer.makeRead(new DataView(packet));
    const response = yield* Response.decode(reader);

    return Either.right([remaining, response] as const);
  });

const tryDecode = (self: Scratch) =>
  Effect.iterate(
    {
      loop: true,
      scratch: self,
      output: [] as Response.Response[],
    },
    {
      while: ({ loop }) => loop,
      body: ({ scratch, output }) =>
        Effect.gen(function* () {
          const result = yield* tryDecodePacket(scratch);

          return Either.match(result, {
            onLeft: (remaining) => ({
              loop: false,
              scratch: remaining,
              output,
            }),

            onRight: ([remaining, response]) => {
              output.push(response);

              return {
                loop: true,
                scratch: remaining,
                output,
              };
            },
          });
        }),
    },
  ).pipe(Effect.map(({ scratch, output }) => [scratch, output] as const));

export class ResponseFromBytesStream<
  E = never,
  R = never,
> extends Streamable.Class<
  Response.Response,
  E | Response.DecodeError | IncompleteResponseError,
  R
> {
  readonly #stream: Stream.Stream<ArrayBuffer, E, R>;

  constructor(stream: Stream.Stream<ArrayBuffer, E, R>) {
    super();

    this.#stream = stream;
  }

  toStream(): Stream.Stream<
    Response.Response,
    E | Response.DecodeError | IncompleteResponseError,
    R
  > {
    let scratch = makeScratch();

    return pipe(
      this.#stream,
      Stream.mapConcatEffect((chunk) =>
        Effect.gen(function* () {
          scratch = pushScratch(scratch, chunk);

          const [remaining, responses] = yield* tryDecode(scratch);
          scratch = remaining;

          return responses;
        }),
      ),
      Stream.concat(
        Stream.fromIterableEffect(
          Effect.gen(function* () {
            // we don't need to `tryDecode` here again, because anytime we receive a value, we try to decode as much as possible.

            if (scratch.length > 0) {
              yield* new IncompleteResponseError({
                length: scratch.length,
              });
            }

            return [];
          }),
        ),
      ),
    );
  }
}

export const make = <E, R>(stream: Stream.Stream<ArrayBuffer, E, R>) =>
  new ResponseFromBytesStream(stream);
