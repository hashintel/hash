import {
  type FastCheck,
  Effect,
  Equal,
  Function,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, encodeDual } from "../../../utils.js";
import type * as Buffer from "../../Buffer.js";

import * as ResponseBody from "./ResponseBody.js";
import * as ResponseFlags from "./ResponseFlags.js";
import * as ResponseHeader from "./ResponseHeader.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/response/Response",
);

export type TypeId = typeof TypeId;

export interface Response
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly header: ResponseHeader.ResponseHeader;
  readonly body: ResponseBody.ResponseBody;
}

const ResponseProto: Omit<Response, "header" | "body"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: Response, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isResponse(that) &&
      Equal.equals(this.header, that.header) &&
      Equal.equals(this.body, that.body)
    );
  },

  [Hash.symbol](this: Response) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.header)),
      Hash.combine(Hash.hash(this.body)),
      Hash.cached(this),
    );
  },

  toString(this: Response) {
    return `Response(${this.header.toString()}, ${this.body.toString()})`;
  },

  toJSON(this: Response) {
    return {
      _id: "Response",
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
  header: ResponseHeader.ResponseHeader,
  body: ResponseBody.ResponseBody,
): Response => createProto(ResponseProto, { header, body });

/**
 *
 * Prepare a response for encoding, this will ensure that the header has all computed flags set.
 *
 * This step is automatically done during encoding, but can be useful to call manually if you want to inspect the
 * header before encoding.
 */
export const prepare = (self: Response) => {
  const variant = ResponseBody.variant(self.body);
  const header = ResponseHeader.applyBodyVariant(self.header, variant);

  return make(header, self.body);
};

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, request: Response) =>
    Effect.gen(function* () {
      const variant = ResponseBody.variant(request.body);
      const header = ResponseHeader.applyBodyVariant(request.header, variant);

      yield* ResponseHeader.encode(buffer, header);
      yield* ResponseBody.encode(buffer, request.body);

      return buffer;
    }),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const header = yield* ResponseHeader.decode(buffer);
    const isBegin = ResponseFlags.isBeginOfResponse(header.flags);

    const body = yield* ResponseBody.decode(
      buffer,
      isBegin ? "ResponseBegin" : "ResponseFrame",
    );

    return make(header, body);
  });

export const isResponse = (value: unknown): value is Response =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .tuple(ResponseHeader.arbitrary(fc), ResponseBody.arbitrary(fc))
    .map(Function.tupled(make));
