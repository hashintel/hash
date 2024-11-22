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

import { createProto, encodeDual } from "../../utils.js";
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
  readonly [TypeId]: TypeId;
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

const make = (value: number): ProtocolVersion =>
  createProto(ProtocolVersionProto, { value });

export const encode = encodeDual(
  (
    buffer: Buffer.WriteBuffer,
    version: ProtocolVersion,
  ): Buffer.WriteResult => {
    return Buffer.putU8(buffer, version.value);
  },
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const version = yield* Buffer.getU8(buffer);

    if (version !== 1) {
      yield* new InvalidProtocolVersionError({ received: version });
    }

    return make(version);
  });

export const V1: ProtocolVersion = make(1);

export const isProtocolVersion = (value: unknown): value is ProtocolVersion =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) => fc.oneof(fc.constant(V1));
