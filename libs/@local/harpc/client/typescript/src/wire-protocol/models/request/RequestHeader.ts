import {
  Arbitrary,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Result,
} from "effect";

import { createProto, implDecode, implEncode } from "../../../utils.js";
import * as Protocol from "../Protocol.js";
import * as RequestFlags from "./RequestFlags.js";
import * as RequestId from "./RequestId.js";

import type * as RequestBody from "./RequestBody.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestHeader",
);

export type TypeId = typeof TypeId;

export interface RequestHeader
  extends Equal.Equal, Inspectable.Inspectable, Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly protocol: Protocol.Protocol;
  readonly requestId: RequestId.RequestId;
  readonly flags: RequestFlags.RequestFlags;
}

const RequestHeaderProto: Omit<
  RequestHeader,
  "protocol" | "requestId" | "flags"
> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: RequestHeader, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isRequestHeader(that) &&
      Equal.equals(this.protocol, that.protocol) &&
      Equal.equals(this.requestId, that.requestId) &&
      Equal.equals(this.flags, that.flags)
    );
  },

  [Hash.symbol](this: RequestHeader) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.protocol)),
      Hash.combine(Hash.hash(this.requestId)),
      Hash.combine(Hash.hash(this.flags)),
    );
  },

  toString(this: RequestHeader) {
    return `RequestHeader(${this.protocol.toString()}, ${this.requestId.toString()}, ${this.flags.toString()})`;
  },

  toJSON(this: RequestHeader) {
    return {
      _id: "RequestHeader",
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
  flags: RequestFlags.RequestFlags,
): RequestHeader =>
  createProto(RequestHeaderProto, { protocol, requestId, flags });

export const applyBodyVariant = (
  header: RequestHeader,
  variant: RequestBody.RequestBodyVariant,
) =>
  make(
    header.protocol,
    header.requestId,
    RequestFlags.applyBodyVariant(header.flags, variant),
  );

export type EncodeError = Result.Result.Failure<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, header: RequestHeader) => {
  return pipe(
    buffer,
    Protocol.encode(header.protocol),
    Result.andThen(RequestId.encode(header.requestId)),
    Result.andThen(RequestFlags.encode(header.flags)),
  );
});

export type DecodeError = Result.Result.Failure<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Result.gen(function* () {
    const protocol = yield* Protocol.decode(buffer);
    const requestId = yield* RequestId.decode(buffer);
    const flags = yield* RequestFlags.decode(buffer);

    return make(protocol, requestId, flags);
  }),
);

export const isRequestHeader = (value: unknown): value is RequestHeader =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = Arbitrary.all([
  Protocol.arbitrary,
  RequestId.arbitrary,
  RequestFlags.arbitrary,
]).pipe(Arbitrary.map(Function.tupled(make)));
