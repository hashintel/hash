import type { FastCheck } from "effect";
import {
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { createProto, encodeDual } from "../utils.js";
import * as Buffer from "../wire-protocol/Buffer.js";
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

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, kind: ResponseKind) =>
    Effect.gen(function* () {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      if (isOk(kind)) {
        return yield* Buffer.putU16(buffer, 0);
      } else {
        return yield* ErrorCode.encode(buffer, kind.code);
      }
    }),
);

export const decode = (buffer: Buffer.ReadBuffer) =>
  Effect.gen(function* () {
    const value = yield* Buffer.getU16(buffer);
    if (value === 0) {
      return ok();
    } else {
      const code = ErrorCode.makeUnchecked(value);
      return err(code);
    }
  });

export const isResponseKind = (value: unknown): value is ResponseKind =>
  Predicate.hasProperty(value, TypeId);

export const isOk = (value: unknown): value is Ok =>
  isResponseKind(value) && value._tag === "Ok";

export const isErr = (value: unknown): value is Err =>
  isResponseKind(value) && value._tag === "Err";

export const arbitrary = (fc: typeof FastCheck) =>
  fc.oneof(fc.constant(ok()), ErrorCode.arbitrary(fc).map(err));
