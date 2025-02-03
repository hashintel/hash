import {
  type FastCheck,
  type Effect,
  Either,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, implDecode, implEncode } from "../../../utils.js";
import * as Payload from "../Payload.js";
import { MutableBuffer } from "../../../binary/index.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/response/ResponseFrame",
);

export type TypeId = typeof TypeId;

export interface ResponseFrame
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly payload: Payload.Payload;
}

const ResponseFrameProto: Omit<ResponseFrame, "payload"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ResponseFrame, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isResponseFrame(that) && Equal.equals(this.payload, that.payload)
    );
  },

  [Hash.symbol](this: ResponseFrame) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.payload)),
      Hash.cached(this),
    );
  },

  toString(this: ResponseFrame) {
    return `ResponseFrame(${this.payload.toString()})`;
  },

  toJSON(this: ResponseFrame) {
    return {
      _id: "ResponseFrame",
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

export const make = (payload: Payload.Payload): ResponseFrame =>
  createProto(ResponseFrameProto, { payload });

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, frame: ResponseFrame) =>
  pipe(
    buffer,
    MutableBuffer.advance(19),
    Either.andThen(Payload.encode(frame.payload)),
  ),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    yield* MutableBuffer.advance(buffer, 19);
    const payload = yield* Payload.decode(buffer);

    return make(payload);
  }),
);

export const isResponseFrame = (value: unknown): value is ResponseFrame =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  Payload.arbitrary(fc).map(make);
