import {
  type FastCheck,
  type Option,
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

import { createProto, implDecode, implEncode } from "../../../utils.js";

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

export const makeBegin = (begin: RequestBegin.RequestBegin): RequestBody =>
  make(Either.right(begin));

export const makeFrame = (frame: RequestFrame.RequestFrame): RequestBody =>
  make(Either.left(frame));

// eslint-disable-next-line fsecond/no-inline-interfaces
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
    // eslint-disable-next-line fsecond/no-inline-interfaces
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

// eslint-disable-next-line fsecond/no-inline-interfaces
export const mapBoth: {
  <A>(
    fn: (
      beginOrFrame: RequestBegin.RequestBegin | RequestFrame.RequestFrame,
    ) => A,
  ): (self: RequestBody) => A;
  <A>(
    self: RequestBody,
    fn: (
      beginOrFrame: RequestBegin.RequestBegin | RequestFrame.RequestFrame,
    ) => A,
  ): A;
} = Function.dual(
  2,
  <A>(
    self: RequestBody,
    fn: (
      beginOrFrame: RequestBegin.RequestBegin | RequestFrame.RequestFrame,
    ) => A,
  ) =>
    match(self, {
      onBegin: (begin) => fn(begin),
      onFrame: (frame) => fn(frame),
    }),
);

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, body: RequestBody) =>
  match(body, {
    onBegin: (begin) => RequestBegin.encode(buffer, begin),
    onFrame: (frame) => RequestFrame.encode(buffer, frame),
  }),
);

export type DecodeError = Effect.Effect.Error<
  ReturnType<ReturnType<typeof decode>>
>;

export const decode = (variantHint: RequestBodyVariant) =>
  implDecode((buffer) => {
    switch (variantHint) {
      case "RequestBegin": {
        return pipe(
          buffer,
          RequestBegin.decode,
          Either.andThen((begin) => make(Either.right(begin))),
        );
      }
      case "RequestFrame": {
        return pipe(
          buffer,
          RequestFrame.decode,
          Either.andThen((frame) => make(Either.left(frame))),
        );
      }
    }
  });

export const variant = (body: RequestBody): RequestBodyVariant =>
  match(body, {
    onBegin: () => "RequestBegin",
    onFrame: () => "RequestFrame",
  });

export const isRequestBody = (value: unknown): value is RequestBody =>
  Predicate.hasProperty(value, TypeId);

export const isBegin = (value: RequestBody) => Either.isRight(value.body);

export const isFrame = (value: RequestBody) => Either.isLeft(value.body);

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
