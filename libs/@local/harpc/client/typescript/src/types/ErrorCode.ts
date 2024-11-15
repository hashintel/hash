import type { FastCheck } from "effect";
import {
  Data,
  Effect,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { U16_MAX } from "../constants.js";
import { createProto, encodeDual } from "../utils.js";
import * as Buffer from "../wire-protocol/Buffer.js";

const TypeId = Symbol("@local/harpc-client/wire-protocol/types/ErrorCode");
export type TypeId = typeof TypeId;

export class ErrorCodeTooLarge extends Data.TaggedError("ErrorCodeTooLarge")<{
  size: number;
}> {
  get message() {
    return `error code is too large, expected error code to be less than or equal to ${U16_MAX}, got ${this.size}`;
  }
}

export class ErrorCodeTooSmall extends Data.TaggedError(
  "ErrorCodeNotPositive",
)<{ size: number }> {
  get message() {
    return `error code mut be a positive number, got ${this.size}`;
  }
}

export interface ErrorCode
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly code: number;
}

const ErrorCodeProto: Omit<ErrorCode, "code"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ErrorCode, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isErrorCode(that) && Equal.equals(this.code, that.code);
  },

  [Hash.symbol](this: ErrorCode) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.number(this.code)),
      Hash.cached(this),
    );
  },

  toString(this: ErrorCode) {
    return `ErrorCode(${this.code})`;
  },

  toJSON(this: ErrorCode) {
    return {
      _id: "ErrorCode",
      code: this.code,
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

/* @internal */
export const makeUnchecked = (code: number): ErrorCode =>
  createProto(ErrorCodeProto, { code });

export const make = (
  code: number,
): Effect.Effect<ErrorCode, ErrorCodeTooLarge | ErrorCodeTooSmall> => {
  if (code < 1) {
    return Effect.fail(new ErrorCodeTooSmall({ size: code }));
  } else if (code > U16_MAX) {
    return Effect.fail(new ErrorCodeTooLarge({ size: code }));
  } else {
    return Effect.succeed(makeUnchecked(code));
  }
};

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, errorCode: ErrorCode) =>
    Buffer.putU16(buffer, errorCode.code),
);

// no decode function, decoding is done through the ResponseKind.ts file

export const isErrorCode = (value: unknown): value is ErrorCode =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: 1, max: U16_MAX }).map(makeUnchecked);
