import type { FastCheck } from "effect";
import {
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import * as Buffer from "../Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/ProtocolVersion",
);
export type TypeId = typeof TypeId;

export interface ProtocolVersion
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  [TypeId]: TypeId;
  readonly value: number;
}

const ProtocolVersionProto: Omit<ProtocolVersion, "value"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ProtocolVersion, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isProtocolVersion(that) && Equal.equals(this.value, that.value);
  },

  [Hash.symbol](this: ProtocolVersion) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.number(this.value)),
      Hash.cached(this),
    );
  },

  toString(this: ProtocolVersion) {
    return `ProtocolVersion(${this.value})`;
  },

  toJSON(this: ProtocolVersion) {
    return {
      _id: "ProtocolVersion",
      value: this.value,
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

const make = (value: number): ProtocolVersion => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(ProtocolVersionProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.value = value;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const encode: {
  (
    version: ProtocolVersion,
  ): (buffer: Buffer.Buffer<Buffer.Write>) => Buffer.Buffer<Buffer.Write>;
  (
    buffer: Buffer.Buffer<Buffer.Write>,
    version: ProtocolVersion,
  ): Buffer.Buffer<Buffer.Write>;
} = Function.dual(
  2,
  (
    buffer: Buffer.Buffer<Buffer.Write>,
    version: ProtocolVersion,
  ): Buffer.Buffer<Buffer.Write> => {
    return Buffer.putU8(buffer, version.value);
  },
);

export const V1: ProtocolVersion = make(1);

export const isProtocolVersion = (value: unknown): value is ProtocolVersion =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) => fc.oneof(fc.constant(V1));
