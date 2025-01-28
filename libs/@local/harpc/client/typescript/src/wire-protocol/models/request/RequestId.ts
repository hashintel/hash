import {
  type FastCheck,
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Either,
} from "effect";

import { U32_MAX, U32_MIN } from "../../../constants.js";
import { createProto, implDecode, implEncode } from "../../../utils.js";
import * as Buffer from "../../Buffer.js";
import { MutableBuffer } from "../../../binary/index.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestId",
);

export type TypeId = typeof TypeId;

export const MIN_VALUE = U32_MIN;
export const MAX_VALUE = U32_MAX;

export interface RequestId
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
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
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.number(this.value)),
      Hash.cached(this),
    );
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

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, requestId: RequestId) =>
  MutableBuffer.putU32(buffer, requestId.value),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  pipe(
    MutableBuffer.getU32(buffer), //
    Either.map(makeUnchecked),
  ),
);

export const isRequestId = (value: unknown): value is RequestId =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: MIN_VALUE, max: MAX_VALUE }).map(makeUnchecked);
