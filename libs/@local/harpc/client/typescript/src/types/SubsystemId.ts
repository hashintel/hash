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

import { U16_MAX, U16_MIN } from "../constants.js";
import * as Buffer from "../wire-protocol/Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/SubsystemId",
);
export type TypeId = typeof TypeId;

export class SubsystemIdTooLarge extends Data.TaggedError(
  "SubsystemIdTooLarge",
)<{ received: number }> {
  get message() {
    return `Procedure ID too large: ${this.received}, expected between ${U16_MIN} and ${U16_MAX}`;
  }
}

export class SubsystemIdTooSmall extends Data.TaggedError(
  "SubsystemIdTooSmall",
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

  readonly id: number;
}

const SubsystemIdProto: Omit<SubsystemId, "id"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: SubsystemId, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isSubsystemId(that) && Equal.equals(this.id, that.id)
    );
  },

  [Hash.symbol](this: SubsystemId) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.id)),
      Hash.cached(this),
    );
  },

  toString(this: SubsystemId) {
    return `SubsystemId(${this.id.toString()})`;
  },

  toJSON(this: SubsystemId) {
    return {
      _id: "SubsystemId",
      id: this.id,
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
export const makeUnchecked = (id: number): SubsystemId => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(SubsystemIdProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.id = id;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const make = (
  id: number,
): Effect.Effect<SubsystemId, SubsystemIdTooLarge | SubsystemIdTooSmall> => {
  if (id < U16_MIN) {
    return Effect.fail(new SubsystemIdTooSmall({ received: id }));
  }

  if (id > U16_MAX) {
    return Effect.fail(new SubsystemIdTooLarge({ received: id }));
  }

  return Effect.succeed(makeUnchecked(id));
};

export const encode: {
  (
    subsystemId: SubsystemId,
  ): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult;
  (buffer: Buffer.WriteBuffer, subsystemId: SubsystemId): Buffer.WriteResult;
} = Function.dual(2, (buffer: Buffer.WriteBuffer, subsystemId: SubsystemId) =>
  Buffer.putU16(buffer, subsystemId.id),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Buffer.getU16(buffer).pipe(Effect.map(makeUnchecked));

export const isSubsystemId = (value: unknown): value is SubsystemId =>
  Predicate.hasProperty(value, TypeId);

export const isReserved = (value: SubsystemId) =>
  // eslint-disable-next-line no-bitwise
  (value.id & 0xf0_00) === 0xf0_00;

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: U16_MIN, max: U16_MAX }).map(makeUnchecked);
