import type { FastCheck } from "effect";
import {
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, encodeDual } from "../../../utils.js";
import * as Buffer from "../../Buffer.js";
import * as Payload from "../Payload.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestFrame",
);
export type TypeId = typeof TypeId;

export interface RequestFrame
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly payload: Payload.Payload;
}

const RequestFrameProto: Omit<RequestFrame, "payload"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: RequestFrame, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isRequestFrame(that) && Equal.equals(this.payload, that.payload)
    );
  },

  [Hash.symbol](this: RequestFrame) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.payload)),
      Hash.cached(this),
    );
  },

  toString(this: RequestFrame) {
    return `RequestFrame(${this.payload.toString()})`;
  },

  toJSON(this: RequestFrame) {
    return {
      _id: "RequestFrame",
      payload: this.payload.toJSON(),
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

export const make = (payload: Payload.Payload): RequestFrame =>
  createProto(RequestFrameProto, { payload });

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, frame: RequestFrame) =>
    pipe(
      buffer,
      Buffer.advance(19),
      Effect.andThen(Payload.encode(frame.payload)),
    ),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    yield* Buffer.advance(buffer, 19);
    const payload = yield* Payload.decode(buffer);

    return make(payload);
  });

export const isRequestFrame = (value: unknown): value is RequestFrame =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  Payload.arbitrary(fc).map(make);
