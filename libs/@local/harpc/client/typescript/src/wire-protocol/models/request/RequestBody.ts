import {
  Arbitrary,
  Equal,
  Function,
  Hash,
  Inspectable,
  type Option,
  pipe,
  Pipeable,
  Predicate,
  Result,
  Schema,
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
  extends Equal.Equal, Inspectable.Inspectable, Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly body: Result.Result<
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
    return pipe(Hash.hash(this[TypeId]), Hash.combine(Hash.hash(this.body)));
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
  body: Result.Result<RequestBegin.RequestBegin, RequestFrame.RequestFrame>,
): RequestBody => createProto(RequestBodyProto, { body });

export const makeBegin = (begin: RequestBegin.RequestBegin): RequestBody =>
  make(Result.succeed(begin));

export const makeFrame = (frame: RequestFrame.RequestFrame): RequestBody =>
  make(Result.fail(frame));

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
    Result.match(self.body, {
      onFailure: options.onFrame,
      onSuccess: options.onBegin,
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

export type EncodeError = Result.Result.Failure<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, body: RequestBody) =>
  match(body, {
    onBegin: (begin) => RequestBegin.encode(buffer, begin),
    onFrame: (frame) => RequestFrame.encode(buffer, frame),
  }),
);

export type DecodeError = Result.Result.Failure<
  ReturnType<ReturnType<typeof decode>>
>;

export const decode = (variantHint: RequestBodyVariant) =>
  implDecode((buffer) => {
    switch (variantHint) {
      case "RequestBegin": {
        return pipe(
          buffer,
          RequestBegin.decode,
          Result.andThen((begin) => make(Result.succeed(begin))),
        );
      }
      case "RequestFrame": {
        return pipe(
          buffer,
          RequestFrame.decode,
          Result.andThen((frame) => make(Result.fail(frame))),
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

export const isBegin = (value: RequestBody) => Result.isSuccess(value.body);

export const isFrame = (value: RequestBody) => Result.isFailure(value.body);

export const getBegin = (
  body: RequestBody,
): Option.Option<RequestBegin.RequestBegin> => Result.getSuccess(body.body);

export const getFrame = (
  body: RequestBody,
): Option.Option<RequestFrame.RequestFrame> => Result.getFailure(body.body);

const arbitraryRequestBegin = RequestBegin.arbitrary.pipe(
  Arbitrary.map(makeBegin),
);
const arbitraryRequestFrame = RequestFrame.arbitrary.pipe(
  Arbitrary.map(makeFrame),
);
export const arbitrary = Arbitrary.schema(Schema.Boolean).pipe(
  Arbitrary.flatMap((pickBegin) =>
    pickBegin ? arbitraryRequestBegin : arbitraryRequestFrame,
  ),
);
