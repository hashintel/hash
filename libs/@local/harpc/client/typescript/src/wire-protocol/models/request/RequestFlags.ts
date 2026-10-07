import {
  Arbitrary,
  Equal,
  Hash,
  HashSet,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Result,
  Schema,
} from "effect";

import { MutableBuffer } from "../../../binary/index.js";
import { createProto, implDecode, implEncode } from "../../../utils.js";

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
  extends Equal.Equal, Inspectable.Inspectable, Pipeable.Pipeable {
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
    return pipe(Hash.hash(this[TypeId]), Hash.combine(Hash.hash(this.flags)));
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

const makeUnchecked = (flags: HashSet.HashSet<Flag>): RequestFlags =>
  createProto(RequestFlagsProto, { flags });

export const make = () => makeUnchecked(HashSet.make());

export const applyBodyVariant = (
  flags: RequestFlags,
  variant: RequestBody.RequestBodyVariant,
) => {
  switch (variant) {
    case "RequestBegin": {
      return HashSet.add(flags.flags, "beginOfRequest").pipe(makeUnchecked);
    }
    case "RequestFrame": {
      return HashSet.remove(flags.flags, "beginOfRequest").pipe(makeUnchecked);
    }
  }
};

export const repr = (flags: RequestFlags) => {
  let value = 0x00;

  if (HashSet.has(flags.flags, "beginOfRequest")) {
    value = value | 0b1000_0000;
  }

  if (HashSet.has(flags.flags, "endOfRequest")) {
    value = value | 0b0000_0001;
  }

  return value;
};

export type EncodeError = Result.Result.Failure<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, flags: RequestFlags) =>
  MutableBuffer.putU8(buffer, repr(flags)),
);

export type DecodeError = Result.Result.Failure<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Result.gen(function* () {
    const value = yield* MutableBuffer.getU8(buffer);

    const flags: Flag[] = [];

    if ((value & 0b1000_0000) === 0b1000_0000) {
      flags.push("beginOfRequest");
    }

    if ((value & 0b0000_0001) === 0b0000_0001) {
      flags.push("endOfRequest");
    }

    return makeUnchecked(HashSet.fromIterable(flags));
  }),
);

export const isRequestFlags = (value: unknown): value is RequestFlags =>
  Predicate.hasProperty(value, TypeId);

export const isBeginOfRequest = (flags: RequestFlags) =>
  HashSet.has(flags.flags, "beginOfRequest");

export const isEndOfRequest = (flags: RequestFlags) =>
  HashSet.has(flags.flags, "endOfRequest");

export const withEndOfRequest = (flags: RequestFlags) =>
  HashSet.add(flags.flags, "endOfRequest").pipe(makeUnchecked);

export const arbitrary = Arbitrary.schema(
  Schema.Array(Schema.Literals(["beginOfRequest", "endOfRequest"])),
).pipe(
  Arbitrary.map((flags) => makeUnchecked(HashSet.fromIterable<Flag>(flags))),
);
