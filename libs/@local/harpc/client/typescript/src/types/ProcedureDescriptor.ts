import {
  type FastCheck,
  type Effect,
  Either,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, implDecode, implEncode } from "../utils.js";

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

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, descriptor: ProcedureDescriptor) =>
  ProcedureId.encode(buffer, descriptor.id),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  ProcedureId.decode(buffer).pipe(Either.map(make)),
);

export const isProcedureDescriptor = (
  value: unknown,
): value is ProcedureDescriptor => Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  ProcedureId.arbitrary(fc).map(make);
