import type { FastCheck } from "effect";
import {
  Effect,
  Equal,
  Hash,
  HashSet,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, encodeDual } from "../../../utils.js";
import * as Buffer from "../../Buffer.js";
import type * as RequestBody from "./RequestBody.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestFlags",
);
export type TypeId = typeof TypeId;

export type Flag =
  // Computed Flags
  | "beginOfRequest"
  // Controlled Flags
  | "endOfRequest";

export interface RequestFlags
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly flags: HashSet.HashSet<Flag>;
}

const RequestFlagsProto: Omit<RequestFlags, "flags"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: RequestFlags, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isRequestFlags(that) && Equal.equals(this.flags, that.flags);
  },

  [Hash.symbol](this: RequestFlags) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.flags)),
      Hash.cached(this),
    );
  },

  toString(this: RequestFlags) {
    return `RequestFlags(${this.flags.toString()})`;
  },

  toJSON(this: RequestFlags) {
    return {
      _id: "RequestFlags",
      flags: this.flags.toJSON(),
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

export const make = (flags: HashSet.HashSet<Flag>): RequestFlags =>
  createProto(RequestFlagsProto, { flags });

export const applyBodyVariant = (
  flags: RequestFlags,
  variant: RequestBody.RequestBodyVariant,
) => {
  switch (variant) {
    case "RequestBegin":
      return HashSet.add(flags.flags, "beginOfRequest").pipe(make);
    case "RequestFrame":
      return HashSet.remove(flags.flags, "beginOfRequest").pipe(make);
  }
};

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, flags: RequestFlags) =>
    Effect.gen(function* () {
      let value = 0x00;

      if (HashSet.has(flags.flags, "beginOfRequest")) {
        // eslint-disable-next-line no-bitwise
        value |= 0b1000_0000;
      }

      if (HashSet.has(flags.flags, "endOfRequest")) {
        // eslint-disable-next-line no-bitwise
        value |= 0b0000_0001;
      }

      return yield* Buffer.putU8(buffer, value);
    }),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const value = yield* Buffer.getU8(buffer);

    const flags = HashSet.empty<Flag>().pipe(HashSet.beginMutation);

    // eslint-disable-next-line no-bitwise
    if ((value & 0b1000_0000) === 0b1000_0000) {
      HashSet.add(flags, "beginOfRequest");
    }

    // eslint-disable-next-line no-bitwise
    if ((value & 0b0000_0001) === 0b0000_0001) {
      HashSet.add(flags, "endOfRequest");
    }

    return make(flags.pipe(HashSet.endMutation));
  });

export const isRequestFlags = (value: unknown): value is RequestFlags =>
  Predicate.hasProperty(value, TypeId);

export const isBeginOfRequest = (flags: RequestFlags) =>
  HashSet.has(flags.flags, "beginOfRequest");

export const isEndOfRequest = (flags: RequestFlags) =>
  HashSet.has(flags.flags, "endOfRequest");

export const arbitrary = (fc: typeof FastCheck) => {
  return fc
    .uniqueArray(fc.constantFrom<Flag>("beginOfRequest", "endOfRequest"))
    .map(HashSet.fromIterable)
    .map(make);
};
