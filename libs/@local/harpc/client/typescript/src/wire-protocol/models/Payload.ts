import {
  type FastCheck,
  Data,
  Effect,
  Either,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { U16_MAX, U16_MIN } from "../../constants.js";
import { MutableBuffer } from "../../binary/index.js";
import {
  createProto,
  hashUint8Array,
  implDecode,
  implEncode,
} from "../../utils.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Payload",
);

export type TypeId = typeof TypeId;

export const MAX_SIZE = U16_MAX - 32;

export class PayloadTooLargeError extends Data.TaggedError(
  "PayloadTooLargeError",
)<{ received: number }> {
  get message(): string {
    return `Payload too large received: ${this.received}, expected a maximum of ${MAX_SIZE}`;
  }
}

export interface Payload
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly buffer: Uint8Array<ArrayBuffer>;
}

const PayloadProto: Omit<Payload, "buffer"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: Payload, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isPayload(that) &&
      this.buffer.length === that.buffer.length &&
      this.buffer.every((byte, index) => byte === that.buffer[index])
    );
  },

  [Hash.symbol](this: Payload) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(hashUint8Array(this.buffer)),
      Hash.cached(this),
    );
  },

  toString(this: Payload) {
    const text = new TextDecoder().decode(this.buffer);

    return `Payload(${text})`;
  },

  toJSON(this: Payload) {
    return {
      _id: "Payload",
      buffer: [...this.buffer],
    };
  },

  [Inspectable.NodeInspectSymbol](this: Payload) {
    return {
      _id: "Payload",
      buffer: new TextDecoder().decode(this.buffer),
    };
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

const makeUnchecked = (buffer: Uint8Array<ArrayBuffer>): Payload =>
  createProto(PayloadProto, { buffer });

/**
 * Creates a new Payload from a buffer, asserting that the buffer is within size limits.
 *
 * This function should be used when you are confident that the buffer size will be valid
 * and want to enforce this assumption at runtime.
 *
 * # Panics
 *
 * Dies if the buffer exceeds MAX_SIZE (U16_MAX - 32 bytes).
 */
export const makeAssert = (buffer: Uint8Array<ArrayBuffer>) => {
  if (buffer.length > MAX_SIZE) {
    return Effect.die(new PayloadTooLargeError({ received: buffer.length }));
  }

  return Effect.succeed(makeUnchecked(buffer));
};

const makeEither = (
  buffer: Uint8Array<ArrayBuffer>,
): Either.Either<Payload, PayloadTooLargeError> => {
  if (buffer.length > MAX_SIZE) {
    return Either.left(new PayloadTooLargeError({ received: buffer.length }));
  }

  return Either.right(makeUnchecked(buffer));
};

/**
 * Creates a new Payload from a buffer, safely handling size validation.
 *
 * This function validates that the buffer size is within acceptable limits and returns
 * an Effect that will fail if the validation does not pass.
 *
 * # Errors
 *
 * Returns a PayloadTooLargeError if the buffer exceeds MAX_SIZE (U16_MAX - 32 bytes).
 */
export const make = (
  buffer: Uint8Array<ArrayBuffer>,
): Effect.Effect<Payload, PayloadTooLargeError> => makeEither(buffer);

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, payload: Payload) =>
  Either.gen(function* () {
    yield* MutableBuffer.putU16(buffer, payload.buffer.length);
    yield* MutableBuffer.putSlice(buffer, payload.buffer);

    return buffer;
  }),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    const length = yield* MutableBuffer.getU16(buffer);
    const slice = yield* MutableBuffer.getSlice(buffer, length);

    return yield* makeEither(slice);
  }),
);

export const isPayload = (value: unknown): value is Payload =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .uint8Array({ minLength: U16_MIN, maxLength: MAX_SIZE })
    // cast needed as fast-check doesn't support Uint8Array<ArrayBuffer> yet
    .map((array) => array as Uint8Array<ArrayBuffer>)
    .map(makeUnchecked);
