import {
  Arbitrary,
  Data,
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Result,
  Schema,
} from "effect";

import { MutableBuffer } from "../../binary/index.js";
import { U16_MAX, U16_MIN, U8_MAX, U8_MIN } from "../../constants.js";
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
  extends Equal.Equal, Inspectable.Inspectable, Pipeable.Pipeable {
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

const makeResult = (
  buffer: Uint8Array<ArrayBuffer>,
): Result.Result<Payload, PayloadTooLargeError> => {
  if (buffer.length > MAX_SIZE) {
    return Result.fail(new PayloadTooLargeError({ received: buffer.length }));
  }

  return Result.succeed(makeUnchecked(buffer));
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
): Effect.Effect<Payload, PayloadTooLargeError> =>
  Effect.fromResult(makeResult(buffer));

export type EncodeError = Result.Result.Failure<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, payload: Payload) =>
  Result.gen(function* () {
    yield* MutableBuffer.putU16(buffer, payload.buffer.length);
    yield* MutableBuffer.putSlice(buffer, payload.buffer);

    return buffer;
  }),
);

export type DecodeError = Result.Result.Failure<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Result.gen(function* () {
    const length = yield* MutableBuffer.getU16(buffer);
    const slice = yield* MutableBuffer.getSlice(buffer, length);

    return yield* makeResult(slice);
  }),
);

export const isPayload = (value: unknown): value is Payload =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = Arbitrary.array(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: U8_MIN, maximum: U8_MAX })),
  ),
  {
    minLength: U16_MIN,
    maxLength: MAX_SIZE,
  },
).pipe(Arbitrary.map((bytes) => makeUnchecked(Uint8Array.from(bytes))));
