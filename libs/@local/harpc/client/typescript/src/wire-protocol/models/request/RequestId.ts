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
  Tuple,
} from "effect";

import * as Buffer from "../../Buffer.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestId",
);
export type TypeId = typeof TypeId;

export interface RequestId
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  [TypeId]: TypeId;
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

/* @internal */
export const makeUnchecked = (value: number): RequestId => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(RequestIdProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.value = value;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const encode: {
  (requestId: RequestId): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult;
  (buffer: Buffer.WriteBuffer, requestId: RequestId): Buffer.WriteResult;
} = Function.dual(2, (buffer: Buffer.WriteBuffer, requestId: RequestId) =>
  Buffer.putU32(buffer, requestId.value),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  pipe(
    Buffer.getU32(buffer),
    Effect.map(Tuple.getFirst),
    Effect.map(makeUnchecked),
  );

export const isRequestId = (value: unknown): value is RequestId =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: 0, max: 4_294_967_295 });
