import type { FastCheck } from "effect";
import {
  Data,
  Effect,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { U16_MAX, U16_MIN } from "../../constants.js";
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
    const hashUint8Array = (array: Uint8Array) => {
      // same as array, so initial state is the same
      let state = 6151;

      // we take the array in steps of 4, and then just hash the 4 bytes
      const remainder = array.length % 4;

      // because they're just numbers and the safe integer range is 2^53 - 1,
      // we can just take it in 32 bit chunks, which means we need to do less overall.
      for (let i = 0; i < array.length - remainder; i += 4) {
        const value =
          // eslint-disable-next-line no-bitwise
          array[i]! |
          // eslint-disable-next-line no-bitwise
          (array[i + 1]! << 8) |
          // eslint-disable-next-line no-bitwise
          (array[i + 2]! << 16) |
          // eslint-disable-next-line no-bitwise
          (array[i + 3]! << 24);

        state = Hash.combine(value)(state);
      }

      // if there are any remaining bytes, we hash them as well
      for (let i = array.length - remainder; i < array.length; i++) {
        state = Hash.combine(array[i]!)(state);
      }

      return Hash.optimize(state);
    };

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
      buffer: Array.from(this.buffer),
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

const makeUnchecked = (buffer: Uint8Array): Payload => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(PayloadProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.buffer = buffer;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const make = (
  buffer: Uint8Array,
): Effect.Effect<Payload, PayloadTooLargeError> => {
  if (buffer.length > MAX_SIZE) {
    return Effect.fail(new PayloadTooLargeError({ received: buffer.length }));
  }

  return Effect.succeed(makeUnchecked(buffer));
};

export const encode: {
  (payload: Payload): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult;
  (buffer: Buffer.WriteBuffer, payload: Payload): Buffer.WriteResult;
} = Function.dual(2, (buffer: Buffer.WriteBuffer, payload: Payload) =>
  Effect.gen(function* () {
    yield* Buffer.putU16(buffer, payload.buffer.length);
    yield* Buffer.putSlice(buffer, payload.buffer);

    return buffer;
  }),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const length = yield* Buffer.getU16(buffer);
    const slice = yield* Buffer.getSlice(buffer, length);

    return make(slice);
  });

export const isPayload = (value: unknown): value is Payload =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc.uint8Array({ min: U16_MIN, max: MAX_SIZE }).map(makeUnchecked);
