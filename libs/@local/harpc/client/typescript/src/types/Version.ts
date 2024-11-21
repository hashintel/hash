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

import { U8_MAX, U8_MIN } from "../constants.js";
import { createProto } from "../utils.js";
import * as Buffer from "../wire-protocol/Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/Version",
);
export type TypeId = typeof TypeId;

export interface Version
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly major: number;
  readonly minor: number;
}

const VersionProto: Omit<Version, "major" | "minor"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: Version, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isVersion(that) &&
      Equal.equals(this.major, that.major) &&
      Equal.equals(this.minor, that.minor)
    );
  },

  [Hash.symbol](this: Version) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.major)),
      Hash.combine(Hash.hash(this.minor)),
      Hash.cached(this),
    );
  },

  toString(this: Version) {
    return `Version(${this.major.toString()}, ${this.minor.toString()})`;
  },

  toJSON(this: Version) {
    return {
      _id: "Version",
      major: this.major,
      minor: this.minor,
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

export const make = (major: number, minor: number): Version =>
  createProto(VersionProto, { major, minor });

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode: {
  (version: Version): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult;
  (buffer: Buffer.WriteBuffer, version: Version): Buffer.WriteResult;
} = Function.dual(2, (buffer: Buffer.WriteBuffer, version: Version) =>
  Effect.gen(function* () {
    yield* Buffer.putU8(buffer, version.major);
    yield* Buffer.putU8(buffer, version.minor);

    return buffer;
  }),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const major = yield* Buffer.getU8(buffer);
    const minor = yield* Buffer.getU8(buffer);

    return make(major, minor);
  });

export const isVersion = (value: unknown): value is Version =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(
      fc.integer({ min: U8_MIN, max: U8_MAX }),
      fc.integer({ min: U8_MIN, max: U8_MAX }),
    )
    .map(Function.tupled(make));
