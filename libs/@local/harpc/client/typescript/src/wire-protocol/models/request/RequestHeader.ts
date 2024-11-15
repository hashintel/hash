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
} from "effect";

import type * as Buffer from "../../Buffer.js";
import * as Protocol from "../Protocol.js";
import * as RequestFlags from "./RequestFlags.js";
import * as RequestId from "./RequestId.js";
import { createProto, encodeDual } from "../../../utils.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestHeader",
);

export type TypeId = typeof TypeId;

export interface RequestHeader
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
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
      Hash.cached(this),
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

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, header: RequestHeader) => {
    return pipe(
      buffer,
      Protocol.encode(header.protocol),
      Effect.andThen(RequestId.encode(header.requestId)),
      Effect.andThen(RequestFlags.encode(header.flags)),
    );
  },
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const protocol = yield* Protocol.decode(buffer);
    const requestId = yield* RequestId.decode(buffer);
    const flags = yield* RequestFlags.decode(buffer);

    return make(protocol, requestId, flags);
  });

export const isRequestHeader = (value: unknown): value is RequestHeader =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(
      Protocol.arbitrary(fc),
      RequestId.arbitrary(fc),
      RequestFlags.arbitrary(fc),
    )
    .map(Function.tupled(make));
