import {
  type FastCheck,
  type Effect,
  Either,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import * as ResponseKind from "../../../types/ResponseKind.js";
import { createProto, implDecode, implEncode } from "../../../utils.js";
import { MutableBuffer } from "../../../binary/index.js";
import * as Payload from "../Payload.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/response/ResponseBegin",
);

export type TypeId = typeof TypeId;

export interface ResponseBegin
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly kind: ResponseKind.ResponseKind;

  readonly payload: Payload.Payload;
}

const ResponseBeginProto: Omit<ResponseBegin, "kind" | "payload"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ResponseBegin, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isResponseBegin(that) &&
      Equal.equals(this.kind, that.kind) &&
      Equal.equals(this.payload, that.payload)
    );
  },

  [Hash.symbol](this: ResponseBegin) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.kind)),
      Hash.combine(Hash.hash(this.payload)),
      Hash.cached(this),
    );
  },

  toString(this: ResponseBegin) {
    return `ResponseBegin(${this.kind.toString()}, ${this.payload.toString()})`;
  },

  toJSON(this: ResponseBegin) {
    return {
      _id: "ResponseBegin",
      kind: this.kind.toJSON(),
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

export const make = (
  kind: ResponseKind.ResponseKind,
  payload: Payload.Payload,
): ResponseBegin => createProto(ResponseBeginProto, { kind, payload });

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, begin: ResponseBegin) =>
  pipe(
    buffer,
    MutableBuffer.advance(17),
    Either.andThen(ResponseKind.encode(buffer, begin.kind)),
    Either.andThen(Payload.encode(begin.payload)),
  ),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    yield* MutableBuffer.advance(buffer, 17);
    const kind = yield* ResponseKind.decode(buffer);
    const payload = yield* Payload.decode(buffer);

    return make(kind, payload);
  }),
);

export const isResponseBegin = (value: unknown): value is ResponseBegin =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(
      ResponseKind.arbitrary(fc), //
      Payload.arbitrary(fc),
    )
    .map(Function.tupled(make));
