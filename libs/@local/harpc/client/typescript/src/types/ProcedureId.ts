import type { FastCheck } from "effect";
import {
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
  "@local/harpc-client/wire-protocol/types/ProcedureId",
);
export type TypeId = typeof TypeId;

export interface ProcedureId
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly id: number;
}

const ProcedureIdProto: Omit<ProcedureId, "id"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ProcedureId, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isProcedureId(that) && Equal.equals(this.id, that.id)
    );
  },

  [Hash.symbol](this: ProcedureId) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.id)),
      Hash.cached(this),
    );
  },

  toString(this: ProcedureId) {
    return `ProcedureId(${this.id.toString()})`;
  },

  toJSON(this: ProcedureId) {
    return {
      _id: "ProcedureId",
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

export const make = (id: number): ProcedureId => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(ProcedureIdProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.id = id;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const encode: {
  (
    procedureId: ProcedureId,
  ): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult;
  (buffer: Buffer.WriteBuffer, procedureId: ProcedureId): Buffer.WriteResult;
} = Function.dual(2, (buffer: Buffer.WriteBuffer, procedureId: ProcedureId) =>
  Buffer.putU16(buffer, procedureId.id),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Buffer.getU16(buffer).pipe(Effect.map(make));

export const isProcedureId = (value: unknown): value is ProcedureId =>
  Predicate.hasProperty(value, TypeId);

export const isReserved = (value: ProcedureId) =>
  // eslint-disable-next-line no-bitwise
  (value.id & 0xf0_00) === 0xf0_00;

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: U16_MIN, max: U16_MAX }).map(make);
