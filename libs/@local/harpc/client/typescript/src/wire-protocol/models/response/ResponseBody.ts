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

import * as ResponseBegin from "./ResponseBegin.js";
import * as ResponseFrame from "./ResponseFrame.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/response/ResponseBody",
);

export type TypeId = typeof TypeId;

export type ResponseBodyVariant = "ResponseBegin" | "ResponseFrame";

export interface ResponseBody
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly body: Either.Either<
    ResponseBegin.ResponseBegin,
    ResponseFrame.ResponseFrame
  >;
}

const ResponseBodyProto: Omit<ResponseBody, "body"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ResponseBody, that: Equal.Equal) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      isResponseBody(that) && Equal.equals(this.body, that.body)
    );
  },

  [Hash.symbol](this: ResponseBody) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.body)),
      Hash.cached(this),
    );
  },

  toString(this: ResponseBody) {
    return `ResponseBody(${this.body.toString()})`;
  },

  toJSON(this: ResponseBody) {
    return {
      _id: "ResponseBody",
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
  body: Either.Either<ResponseBegin.ResponseBegin, ResponseFrame.ResponseFrame>,
): ResponseBody => createProto(ResponseBodyProto, { body });

// eslint-disable-next-line fsecond/no-inline-interfaces
export const match: {
  <A, B = A>(options: {
    readonly onBegin: (begin: ResponseBegin.ResponseBegin) => A;
    readonly onFrame: (frame: ResponseFrame.ResponseFrame) => B;
  }): (self: ResponseBody) => A | B;
  <A, B = A>(
    self: ResponseBody,
    options: {
      readonly onBegin: (begin: ResponseBegin.ResponseBegin) => A;
      readonly onFrame: (frame: ResponseFrame.ResponseFrame) => B;
    },
  ): A | B;
} = Function.dual(
  2,
  <A, B = A>(
    self: ResponseBody,
    // eslint-disable-next-line fsecond/no-inline-interfaces
    options: {
      readonly onBegin: (begin: ResponseBegin.ResponseBegin) => A;
      readonly onFrame: (frame: ResponseFrame.ResponseFrame) => B;
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
      beginOrFrame: ResponseBegin.ResponseBegin | ResponseFrame.ResponseFrame,
    ) => A,
  ): (self: ResponseBody) => A;
  <A>(
    self: ResponseBody,
    fn: (
      beginOrFrame: ResponseBegin.ResponseBegin | ResponseFrame.ResponseFrame,
    ) => A,
  ): A;
} = Function.dual(
  2,
  <A>(
    self: ResponseBody,
    fn: (
      beginOrFrame: ResponseBegin.ResponseBegin | ResponseFrame.ResponseFrame,
    ) => A,
  ) =>
    match(self, {
      onBegin: (begin) => fn(begin),
      onFrame: (frame) => fn(frame),
    }),
);

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, body: ResponseBody) =>
  match(body, {
    onBegin: (begin) => ResponseBegin.encode(buffer, begin),
    onFrame: (frame) => ResponseFrame.encode(buffer, frame),
  }),
);

export type DecodeError = Effect.Effect.Error<
  ReturnType<ReturnType<typeof decode>>
>;

export const decode = (variantHint: ResponseBodyVariant) =>
  implDecode((buffer) => {
    switch (variantHint) {
      case "ResponseBegin": {
        return pipe(
          buffer,
          ResponseBegin.decode,
          Either.andThen((begin) => make(Either.right(begin))),
        );
      }
      case "ResponseFrame": {
        return pipe(
          buffer,
          ResponseFrame.decode,
          Either.andThen((frame) => make(Either.left(frame))),
        );
      }
    }
  });

export const variant = (body: ResponseBody): ResponseBodyVariant =>
  match(body, {
    onBegin: () => "ResponseBegin",
    onFrame: () => "ResponseFrame",
  });

export const isResponseBody = (value: unknown): value is ResponseBody =>
  Predicate.hasProperty(value, TypeId);

export const getBegin = (
  body: ResponseBody,
): Option.Option<ResponseBegin.ResponseBegin> => Either.getRight(body.body);

export const getFrame = (
  body: ResponseBody,
): Option.Option<ResponseFrame.ResponseFrame> => Either.getLeft(body.body);

export const arbitrary = (fc: typeof FastCheck) =>
  fc
    .oneof(
      ResponseBegin.arbitrary(fc).map(Either.right),
      ResponseFrame.arbitrary(fc).map(Either.left),
    )
    .map(make);
