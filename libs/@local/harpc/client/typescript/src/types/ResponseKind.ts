/* eslint-disable unicorn/prevent-abbreviations -- same name as Rust reference implementation */
import {
  type Effect,
  Either,
  Equal,
  type FastCheck,
  Function,
  Hash,
  Inspectable,
  Option,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, implDecode, implEncode } from "../utils.js";
import { MutableBuffer } from "../binary/index.js";

import * as ErrorCode from "./ErrorCode.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/types/ResponseKind",
);

export type TypeId = typeof TypeId;

export interface Ok
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly _tag: "Ok";
}

const OkProto: Ok = {
  [TypeId]: TypeId,
  _tag: "Ok",

  [Equal.symbol](this: Ok, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isOk(that);
  },

  [Hash.symbol](this: Ok) {
    return pipe(
      Hash.hash(this[TypeId]), //
      Hash.cached(this),
    );
  },

  toString(this: Ok) {
    return `Ok()`;
  },

  toJSON(this: Ok) {
    return {
      _id: "ResponseKind",
      _tag: "Ok",
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

export const ok = (): Ok => createProto(OkProto, {});

export interface Err
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly _tag: "Err";

  readonly code: ErrorCode.ErrorCode;
}

const ErrProto: Omit<Err, "code"> = {
  [TypeId]: TypeId,
  _tag: "Err",

  [Equal.symbol](this: Err, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isErr(that) && Equal.equals(this.code, that.code);
  },

  [Hash.symbol](this: Err) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.hash(this.code)),
      Hash.cached(this),
    );
  },

  toString(this: Err) {
    return `Err(${this.code.toString()})`;
  },

  toJSON(this: Err) {
    return {
      _id: "ResponseKind",
      _tag: "Err",
      code: this.code.toJSON(),
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

export const err = (code: ErrorCode.ErrorCode): Err =>
  createProto(ErrProto, { code });

export type ResponseKind = Ok | Err;

export type EncodeError = Effect.Effect.Error<ReturnType<typeof encode>>;

export const encode = implEncode((buffer, kind: ResponseKind) =>
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  isOk(kind)
    ? MutableBuffer.putU16(buffer, 0)
    : ErrorCode.encode(buffer, kind.code),
);

export type DecodeError = Effect.Effect.Error<ReturnType<typeof decode>>;

export const decode = implDecode((buffer) =>
  Either.gen(function* () {
    const value = yield* MutableBuffer.getU16(buffer);

    if (value === 0) {
      return ok();
    }

    const code = ErrorCode.makeUnchecked(value);

    return err(code);
  }),
);

export const isResponseKind = (value: unknown): value is ResponseKind =>
  Predicate.hasProperty(value, TypeId);

export const isOk = (value: unknown): value is Ok =>
  isResponseKind(value) && value._tag === "Ok";

export const isErr = (value: unknown): value is Err =>
  isResponseKind(value) && value._tag === "Err";

// eslint-disable-next-line fsecond/no-inline-interfaces
export const match: {
  <A, B = A>(options: {
    readonly onOk: () => A;
    readonly onErr: (code: ErrorCode.ErrorCode) => B;
  }): (self: ResponseKind) => A | B;
  <A, B = A>(
    self: ResponseKind,
    options: {
      readonly onOk: () => A;
      readonly onErr: (code: ErrorCode.ErrorCode) => B;
    },
  ): A | B;
} = Function.dual(
  2,
  <A, B = A>(
    self: ResponseKind,
    // eslint-disable-next-line fsecond/no-inline-interfaces
    options: {
      readonly onOk: () => A;
      readonly onErr: (code: ErrorCode.ErrorCode) => B;
    },
  ) => {
    if (isOk(self)) {
      return options.onOk();
    }

    return options.onErr(self.code);
  },
);

export const getErr = (
  self: ResponseKind,
): Option.Option<ErrorCode.ErrorCode> =>
  match(self, {
    onOk: Option.none,
    onErr: Option.some,
  });

export const arbitrary = (fc: typeof FastCheck) =>
  fc.oneof(fc.constant(ok()), ErrorCode.arbitrary(fc).map(err));
