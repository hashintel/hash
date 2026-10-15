import {
  Arbitrary,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Result,
  Schema,
} from "effect";

import { MutableBuffer } from "../../../binary/index.js";
import { U32_MAX, U32_MIN } from "../../../constants.js";
import { createProto, implDecode, implEncode } from "../../../utils.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestId",
);

export type TypeId = typeof TypeId;

export const MIN_VALUE = U32_MIN;
export const MAX_VALUE = U32_MAX;

export interface RequestId
  extends Equal.Equal, Inspectable.Inspectable, Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly value: number;
}

const RequestIdProto: Omit<RequestId, "value"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: RequestId, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isRequestId(that) && Equal.equals(this.value, that.value);
  },

  [Hash.symbol](this: RequestId) {
    return pipe(Hash.hash(this[TypeId]), Hash.combine(Hash.number(this.value)));
  },

  toString(this: RequestId) {
    return `RequestId(${this.value})`;
  },

  toJSON(this: RequestId) {
    return {
      _id: "RequestId",
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

/** @internal */
export const makeUnchecked = (value: number): RequestId =>
  createProto(RequestIdProto, { value });

export type EncodeError = Result.Result.Failure<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, requestId: RequestId) =>
  MutableBuffer.putU32(buffer, requestId.value),
);

export type DecodeError = Result.Result.Failure<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  pipe(
    MutableBuffer.getU32(buffer), //
    Result.map(makeUnchecked),
  ),
);

export const isRequestId = (value: unknown): value is RequestId =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = Arbitrary.schema(
  Schema.Int.check(
    Schema.isBetween({ minimum: MIN_VALUE, maximum: MAX_VALUE }),
  ),
).pipe(Arbitrary.map(makeUnchecked));
