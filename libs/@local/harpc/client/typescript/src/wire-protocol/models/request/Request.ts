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

import * as RequestBody from "./RequestBody.js";
import * as RequestFlags from "./RequestFlags.js";
import * as RequestHeader from "./RequestHeader.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/Request",
);

export type TypeId = typeof TypeId;

export interface Request
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly header: RequestHeader.RequestHeader;
  readonly body: RequestBody.RequestBody;
}

const RequestProto: Omit<Request, "header" | "body"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: Request, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isRequest(that) &&
      Equal.equals(this.header, that.header) &&
      Equal.equals(this.body, that.body)
    );
  },

  [Hash.symbol](this: Request) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.header)),
      Hash.combine(Hash.hash(this.body)),
      Hash.cached(this),
    );
  },

  toString(this: Request) {
    return `Request(${this.header.toString()}, ${this.body.toString()})`;
  },

  toJSON(this: Request) {
    return {
      _id: "Request",
      header: this.header.toJSON(),
      body: this.body.toJSON(),
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
  header: RequestHeader.RequestHeader,
  body: RequestBody.RequestBody,
): Request => createProto(RequestProto, { header, body });

/**
 *
 * Prepare a request for encoding, this will ensure that the header has all computed flags set.
 *
 * This step is automatically done during encoding, but can be useful to call manually if you want to inspect the
 * header before encoding.
 */
export const prepare = (self: Request) => {
  const variant = RequestBody.variant(self.body);
  const header = RequestHeader.applyBodyVariant(self.header, variant);

  return make(header, self.body);
};

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, request: Request) =>
  Either.gen(function* () {
    const variant = RequestBody.variant(request.body);
    const header = RequestHeader.applyBodyVariant(request.header, variant);

    yield* RequestHeader.encode(buffer, header);
    yield* RequestBody.encode(buffer, request.body);

    return buffer;
  }),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    const header = yield* RequestHeader.decode(buffer);
    const isBegin = RequestFlags.isBeginOfRequest(header.flags);

    const body = yield* RequestBody.decode(
      isBegin ? "RequestBegin" : "RequestFrame",
    )(buffer);

    return make(header, body);
  }),
);

export const isRequest = (value: unknown): value is Request =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(RequestHeader.arbitrary(fc), RequestBody.arbitrary(fc))
    .map(Function.tupled(make));
