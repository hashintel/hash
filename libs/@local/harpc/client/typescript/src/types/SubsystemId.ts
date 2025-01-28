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

import { U16_MAX, U16_MIN } from "../constants.js";
import { createProto, implDecode, implEncode } from "../utils.js";
import { MutableBuffer } from "../binary/index.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/SubsystemId",
);

export type TypeId = typeof TypeId;

export class SubsystemIdTooLargeError extends Data.TaggedError(
  "SubsystemIdTooLargeError",
)<{ received: number }> {
  get message() {
    return `Procedure ID too large: ${this.received}, expected between ${U16_MIN} and ${U16_MAX}`;
  }
}

export class SubsystemIdTooSmallError extends Data.TaggedError(
  "SubsystemIdTooSmallError",
)<{ received: number }> {
  get message() {
    return `Procedure ID too small: ${this.received}, expected between ${U16_MIN} and ${U16_MAX}`;
  }
}

export interface SubsystemId
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly value: number;
}

const SubsystemIdProto: Omit<SubsystemId, "value"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: SubsystemId, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isSubsystemId(that) && Equal.equals(this.value, that.value)
    );
  },

  [Hash.symbol](this: SubsystemId) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.value)),
      Hash.cached(this),
    );
  },

  toString(this: SubsystemId) {
    return `SubsystemId(${this.value.toString()})`;
  },

  toJSON(this: SubsystemId) {
    return {
      _id: "SubsystemId",
      id: this.value,
    };
  },

  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

/** @internal */
export const makeUnchecked = (value: number): SubsystemId =>
  createProto(SubsystemIdProto, { value });

export const make = (
  id: number,
): Effect.Effect<
  SubsystemId,
  SubsystemIdTooLargeError | SubsystemIdTooSmallError
> => {
  if (id < U16_MIN) {
    return Effect.fail(new SubsystemIdTooSmallError({ received: id }));
  }

  if (id > U16_MAX) {
    return Effect.fail(new SubsystemIdTooLargeError({ received: id }));
  }

  return Effect.succeed(makeUnchecked(id));
};

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, subsystemId: SubsystemId) =>
  MutableBuffer.putU16(buffer, subsystemId.value),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  MutableBuffer.getU16(buffer).pipe(Either.map(makeUnchecked)),
);

export const isSubsystemId = (value: unknown): value is SubsystemId =>
  Predicate.hasProperty(value, TypeId);

export const isReserved = (value: SubsystemId) =>
  (value.value & 0xf0_00) === 0xf0_00;

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: U16_MIN, max: U16_MAX }).map(makeUnchecked);
