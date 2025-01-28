import {
  type FastCheck,
  Effect,
  Either,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, implDecode, implEncode } from "../../../utils.js";
import type * as Buffer from "../../Buffer.js";
import * as Protocol from "../Protocol.js";
import { RequestId } from "../request/index.js";

import type * as ResponseBody from "./ResponseBody.js";
import * as ResponseFlags from "./ResponseFlags.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/response/ResponseHeader",
);

export type TypeId = typeof TypeId;

export interface ResponseHeader
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly protocol: Protocol.Protocol;
  readonly requestId: RequestId.RequestId;

  readonly flags: ResponseFlags.ResponseFlags;
}

const ResponseHeaderProto: Omit<
  ResponseHeader,
  "protocol" | "requestId" | "flags"
> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ResponseHeader, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isResponseHeader(that) &&
      Equal.equals(this.protocol, that.protocol) &&
      Equal.equals(this.requestId, that.requestId) &&
      Equal.equals(this.flags, that.flags)
    );
  },

  [Hash.symbol](this: ResponseHeader) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.protocol)),
      Hash.combine(Hash.hash(this.requestId)),
      Hash.combine(Hash.hash(this.flags)),
      Hash.cached(this),
    );
  },

  toString(this: ResponseHeader) {
    return `ResponseHeader(${this.protocol.toString()}, ${this.requestId.toString()}, ${this.flags.toString()})`;
  },

  toJSON(this: ResponseHeader) {
    return {
      _id: "ResponseHeader",
      protocol: this.protocol.toJSON(),
      requestId: this.requestId.toJSON(),
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

export const make = (
  protocol: Protocol.Protocol,
  requestId: RequestId.RequestId,
  flags: ResponseFlags.ResponseFlags,
): ResponseHeader =>
  createProto(ResponseHeaderProto, { protocol, requestId, flags });

export const applyBodyVariant = (
  header: ResponseHeader,
  variant: ResponseBody.ResponseBodyVariant,
) =>
  make(
    header.protocol,
    header.requestId,
    ResponseFlags.applyBodyVariant(header.flags, variant),
  );

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, header: ResponseHeader) => {
  return pipe(
    buffer,
    Protocol.encode(header.protocol),
    Either.andThen(RequestId.encode(header.requestId)),
    Either.andThen(ResponseFlags.encode(header.flags)),
  );
});

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    const protocol = yield* Protocol.decode(buffer);
    const requestId = yield* RequestId.decode(buffer);
    const flags = yield* ResponseFlags.decode(buffer);

    return make(protocol, requestId, flags);
  }),
);

export const isResponseHeader = (value: unknown): value is ResponseHeader =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(
      Protocol.arbitrary(fc),
      RequestId.arbitrary(fc),
      ResponseFlags.arbitrary(fc),
    )
    .map(Function.tupled(make));
