import {
  type FastCheck,
  Data,
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { U16_MAX, U16_MIN } from "../../constants.js";
import { createProto, encodeDual, hashUint8Array } from "../../utils.js";
import * as Buffer from "../Buffer.js";

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

  readonly buffer: Uint8Array;
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

const makeUnchecked = (buffer: Uint8Array): Payload =>
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
export const makeAssert = (buffer: Uint8Array) => {
  if (buffer.length > MAX_SIZE) {
    return Effect.die(new PayloadTooLargeError({ received: buffer.length }));
  }

  return Effect.succeed(makeUnchecked(buffer));
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
  buffer: Uint8Array,
): Effect.Effect<Payload, PayloadTooLargeError> => {
  if (buffer.length > MAX_SIZE) {
    return Effect.fail(new PayloadTooLargeError({ received: buffer.length }));
  }

  return Effect.succeed(makeUnchecked(buffer));
};

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, payload: Payload) =>
    Effect.gen(function* () {
      yield* Buffer.putU16(buffer, payload.buffer.length);
      yield* Buffer.putSlice(buffer, payload.buffer);

      return buffer;
    }),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const length = yield* Buffer.getU16(buffer);
    const slice = yield* Buffer.getSlice(buffer, length);

    return yield* make(slice);
  });

export const isPayload = (value: unknown): value is Payload =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc.uint8Array({ minLength: U16_MIN, maxLength: MAX_SIZE }).map(makeUnchecked);
