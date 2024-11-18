import type { FastCheck, Option } from "effect";
import {
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

import { createProto, encodeDual } from "../../../utils.js";
import type * as Buffer from "../../Buffer.js";
import * as RequestBegin from "./RequestBegin.js";
import * as RequestFrame from "./RequestFrame.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestBody",
);
export type TypeId = typeof TypeId;

export type RequestBodyVariant = "RequestBegin" | "RequestFrame";

export interface RequestBody
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly body: Either.Either<
    RequestBegin.RequestBegin,
    RequestFrame.RequestFrame
  >;
}

const RequestBodyProto: Omit<RequestBody, "body"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: RequestBody, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isRequestBody(that) && Equal.equals(this.body, that.body)
    );
  },

  [Hash.symbol](this: RequestBody) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.body)),
      Hash.cached(this),
    );
  },

  toString(this: RequestBody) {
    return `RequestBody(${this.body.toString()})`;
  },

  toJSON(this: RequestBody) {
    return {
      _id: "RequestBody",
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
  body: Either.Either<RequestBegin.RequestBegin, RequestFrame.RequestFrame>,
): RequestBody => createProto(RequestBodyProto, { body });

export const match: {
  <A, B = A>(options: {
    readonly onBegin: (begin: RequestBegin.RequestBegin) => A;
    readonly onFrame: (frame: RequestFrame.RequestFrame) => B;
  }): (self: RequestBody) => A | B;
  <A, B = A>(
    self: RequestBody,
    options: {
      readonly onBegin: (begin: RequestBegin.RequestBegin) => A;
      readonly onFrame: (frame: RequestFrame.RequestFrame) => B;
    },
  ): A | B;
} = Function.dual(
  2,
  <A, B = A>(
    self: RequestBody,
    options: {
      readonly onBegin: (begin: RequestBegin.RequestBegin) => A;
      readonly onFrame: (frame: RequestFrame.RequestFrame) => B;
    },
  ) =>
    Either.match(self.body, {
      onLeft: options.onFrame,
      onRight: options.onBegin,
    }),
);

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, body: RequestBody) =>
    match(body, {
      onBegin: (begin) => RequestBegin.encode(buffer, begin),
      onFrame: (frame) => RequestFrame.encode(buffer, frame),
    }),
);

export const decode = (
  buffer: Buffer.ReadBuffer,
  variant: RequestBodyVariant,
) => {
  switch (variant) {
    case "RequestBegin":
      return pipe(
        buffer,
        RequestBegin.decode,
        Effect.andThen((begin) => make(Either.right(begin))),
      );
    case "RequestFrame":
      return pipe(
        buffer,
        RequestFrame.decode,
        Effect.andThen((frame) => make(Either.left(frame))),
      );
  }
};

export const variant = (body: RequestBody): RequestBodyVariant =>
  match(body, {
    onBegin: () => "RequestBegin",
    onFrame: () => "RequestFrame",
  });

export const isRequestBody = (value: unknown): value is RequestBody =>
  Predicate.hasProperty(value, TypeId);

export const getBegin = (
  body: RequestBody,
): Option.Option<RequestBegin.RequestBegin> => Either.getRight(body.body);

export const getFrame = (
  body: RequestBody,
): Option.Option<RequestFrame.RequestFrame> => Either.getLeft(body.body);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .oneof(
      RequestBegin.arbitrary(fc).map(Either.right),
      RequestFrame.arbitrary(fc).map(Either.left),
    )
    .map(make);
