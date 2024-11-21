import type { FastCheck } from "effect";
import {
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, encodeDual } from "../utils.js";
import type * as Buffer from "../wire-protocol/Buffer.js";
import * as ProcedureId from "./ProcedureId.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/ProcedureDescriptor",
);
export type TypeId = typeof TypeId;

export interface ProcedureDescriptor
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly id: ProcedureId.ProcedureId;
}

const ProcedureDescriptorProto: Omit<ProcedureDescriptor, "id"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ProcedureDescriptor, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isProcedureDescriptor(that) && Equal.equals(this.id, that.id)
    );
  },

  [Hash.symbol](this: ProcedureDescriptor) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.id)),
      Hash.cached(this),
    );
  },

  toString(this: ProcedureDescriptor) {
    return `ProcedureDescriptor(${this.id.toString()})`;
  },

  toJSON(this: ProcedureDescriptor) {
    return {
      _id: "ProcedureDescriptor",
      id: this.id.toJSON(),
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

export const make = (id: ProcedureId.ProcedureId): ProcedureDescriptor =>
  createProto(ProcedureDescriptorProto, { id });

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, descriptor: ProcedureDescriptor) =>
    ProcedureId.encode(buffer, descriptor.id),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  ProcedureId.decode(buffer).pipe(Effect.map(make));

export const isProcedureDescriptor = (
  value: unknown,
): value is ProcedureDescriptor => Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  ProcedureId.arbitrary(fc).map(make);
