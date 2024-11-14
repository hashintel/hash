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

import * as Buffer from "../Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/ProtocolVersion",
);
export type TypeId = typeof TypeId;

export class InvalidProtocolVersionError extends Data.TaggedError(
  "InvalidProtocolVersionError",
)<{
  received: number;
}> {
  get message(): string {
    return `Invalid protocol version received: ${this.received}`;
  }
}

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
  ): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult;
  (buffer: Buffer.WriteBuffer, version: ProtocolVersion): Buffer.WriteResult;
} = Function.dual(
  2,
  (
    buffer: Buffer.WriteBuffer,
    version: ProtocolVersion,
  ): Buffer.WriteResult => {
    return Buffer.putU8(buffer, version.value);
  },
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const [version, _] = yield* Buffer.getU8(buffer);

    if (version !== 1) {
      yield* new InvalidProtocolVersionError({ received: version });
    }

    return make(version);
  });

export const V1: ProtocolVersion = make(1);

export const isProtocolVersion = (value: unknown): value is ProtocolVersion =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) => fc.oneof(fc.constant(V1));
