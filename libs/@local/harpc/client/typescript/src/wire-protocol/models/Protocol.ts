import {
  Arbitrary,
  Data,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Result,
} from "effect";

import { MutableBuffer } from "../../binary/index.js";
import { createProto, implDecode, implEncode } from "../../utils.js";
import * as ProtocolVersion from "./ProtocolVersion.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/Protocol",
);

export type TypeId = typeof TypeId;

export class InvalidMagicError extends Data.TaggedError("InvalidMagicError")<{
  received: Uint8Array;
}> {
  get message(): string {
    const receivedString = new TextDecoder().decode(this.received);

    return `Invalid magic received: ${receivedString}`;
  }
}

export interface Protocol
  extends Equal.Equal, Inspectable.Inspectable, Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly version: ProtocolVersion.ProtocolVersion;
}

const ProtocolProto: Omit<Protocol, "version"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: Protocol, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isProtocol(that) && Equal.equals(this.version, that.version);
  },

  [Hash.symbol](this: Protocol) {
    return pipe(Hash.hash(this[TypeId]), Hash.combine(Hash.hash(this.version)));
  },

  toString(this: Protocol) {
    return `Protocol(${this.version.toString()})`;
  },

  toJSON(this: Protocol) {
    return {
      _id: "Protocol",
      version: this.version.toJSON(),
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

export const make = (version: ProtocolVersion.ProtocolVersion): Protocol =>
  createProto(ProtocolProto, { version });

const MAGIC = new Uint8Array([
  0x68 /* h */, 0x61 /* a */, 0x72 /* r */, 0x70 /* p */, 0x63 /* c */,
]);

export type EncodeError = Result.Result.Failure<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, protocol: Protocol) =>
  pipe(
    buffer,
    MutableBuffer.putSlice(MAGIC),
    Result.andThen(ProtocolVersion.encode(protocol.version)),
  ),
);

export type DecodeError = Result.Result.Failure<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Result.gen(function* () {
    const magic = yield* MutableBuffer.getSlice(buffer, 5);

    if (magic.some((byte, index) => byte !== MAGIC[index])) {
      yield* Result.fail(new InvalidMagicError({ received: magic }));
    }

    const version = yield* ProtocolVersion.decode(buffer);

    return make(version);
  }),
);

export const isProtocol = (value: unknown): value is Protocol =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = ProtocolVersion.arbitrary.pipe(Arbitrary.map(make));
