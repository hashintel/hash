import type { FastCheck } from "effect";
import {
  Data,
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { U16_MAX, U16_MIN } from "../constants.js";
import { createProto, encodeDual } from "../utils.js";
import * as Buffer from "../wire-protocol/Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/ProcedureId",
);
export type TypeId = typeof TypeId;

export class ProcedureIdTooLarge extends Data.TaggedError(
  "ProcedureIdTooLarge",
)<{ received: number }> {
  get message() {
    return `Procedure ID too large: ${this.received}, expected between ${U16_MIN} and ${U16_MAX}`;
  }
}

export class ProcedureIdTooSmall extends Data.TaggedError(
  "ProcedureIdTooSmall",
)<{ received: number }> {
  get message() {
    return `Procedure ID too small: ${this.received}, expected between ${U16_MIN} and ${U16_MAX}`;
  }
}

export interface ProcedureId
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly value: number;
}

const ProcedureIdProto: Omit<ProcedureId, "value"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ProcedureId, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isProcedureId(that) && Equal.equals(this.value, that.value)
    );
  },

  [Hash.symbol](this: ProcedureId) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.value)),
      Hash.cached(this),
    );
  },

  toString(this: ProcedureId) {
    return `ProcedureId(${this.value.toString()})`;
  },

  toJSON(this: ProcedureId) {
    return {
      _id: "ProcedureId",
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
export const makeUnchecked = (value: number): ProcedureId =>
  createProto(ProcedureIdProto, { value });

export const make = (
  id: number,
): Effect.Effect<ProcedureId, ProcedureIdTooSmall | ProcedureIdTooLarge> => {
  if (id < U16_MIN) {
    return Effect.fail(new ProcedureIdTooSmall({ received: id }));
  }
  if (id > U16_MAX) {
    return Effect.fail(new ProcedureIdTooLarge({ received: id }));
  }

  return Effect.succeed(makeUnchecked(id));
};

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, procedureId: ProcedureId) =>
    Buffer.putU16(buffer, procedureId.value),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Buffer.getU16(buffer).pipe(Effect.map(makeUnchecked));

export const isProcedureId = (value: unknown): value is ProcedureId =>
  Predicate.hasProperty(value, TypeId);

export const isReserved = (value: ProcedureId) =>
  // eslint-disable-next-line no-bitwise
  (value.value & 0xf0_00) === 0xf0_00;

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: U16_MIN, max: U16_MAX }).map(makeUnchecked);
