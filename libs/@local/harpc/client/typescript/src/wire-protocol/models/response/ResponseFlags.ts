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
import type * as ResponseBody from "./ResponseBody.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/response/ResponseFlags",
);
export type TypeId = typeof TypeId;

export type Flag =
  // Computed Flags
  | "beginOfResponse"
  // Controlled Flags
  | "endOfResponse";

export interface ResponseFlags
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly flags: HashSet.HashSet<Flag>;
}

const ResponseFlagsProto: Omit<ResponseFlags, "flags"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ResponseFlags, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isResponseFlags(that) && Equal.equals(this.flags, that.flags);
  },

  [Hash.symbol](this: ResponseFlags) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.flags)),
      Hash.cached(this),
    );
  },

  toString(this: ResponseFlags) {
    return `ResponseFlags(${this.flags.toString()})`;
  },

  toJSON(this: ResponseFlags) {
    return {
      _id: "ResponseFlags",
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

export const make = (flags: HashSet.HashSet<Flag>): ResponseFlags =>
  createProto(ResponseFlagsProto, { flags });

export const applyBodyVariant = (
  flags: ResponseFlags,
  variant: ResponseBody.ResponseBodyVariant,
) => {
  switch (variant) {
    case "ResponseBegin":
      return HashSet.add(flags.flags, "beginOfResponse").pipe(make);
    case "ResponseFrame":
      return HashSet.remove(flags.flags, "beginOfResponse").pipe(make);
  }
};

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, flags: ResponseFlags) =>
    Effect.gen(function* () {
      let value = 0x00;

      if (HashSet.has(flags.flags, "beginOfResponse")) {
        // eslint-disable-next-line no-bitwise
        value |= 0b1000_0000;
      }

      if (HashSet.has(flags.flags, "endOfResponse")) {
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
      HashSet.add(flags, "beginOfResponse");
    }

    // eslint-disable-next-line no-bitwise
    if ((value & 0b0000_0001) === 0b0000_0001) {
      HashSet.add(flags, "endOfResponse");
    }

    return make(flags.pipe(HashSet.endMutation));
  });

export const isResponseFlags = (value: unknown): value is ResponseFlags =>
  Predicate.hasProperty(value, TypeId);

export const isBeginOfResponse = (flags: ResponseFlags) =>
  HashSet.has(flags.flags, "beginOfResponse");

export const isEndOfResponse = (flags: ResponseFlags) =>
  HashSet.has(flags.flags, "endOfResponse");

export const arbitrary = (fc: typeof FastCheck) => {
  return fc
    .uniqueArray(fc.constantFrom<Flag>("beginOfResponse", "endOfResponse"))
    .map(HashSet.fromIterable)
    .map(make);
};
