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
  received: number;
}> {
  get message() {
    return `error code is too large, expected error code to be less than or equal to ${U16_MAX}, got ${this.received}`;
  }
}

export class ErrorCodeTooSmall extends Data.TaggedError(
  "ErrorCodeNotPositive",
)<{ received: number }> {
  get message() {
    return `error code mut be a positive number, got ${this.received}`;
  }
}

export interface ErrorCode
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly value: number;
}

const ErrorCodeProto: Omit<ErrorCode, "value"> = {
  [TypeId]: TypeId,

  [Equal.symbol](this: ErrorCode, that: Equal.Equal) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isErrorCode(that) && Equal.equals(this.value, that.value);
  },

  [Hash.symbol](this: ErrorCode) {
    return pipe(
      Hash.hash(this[TypeId]),
      Hash.combine(Hash.number(this.value)),
      Hash.cached(this),
    );
  },

  toString(this: ErrorCode) {
    return `ErrorCode(${this.value})`;
  },

  toJSON(this: ErrorCode) {
    return {
      _id: "ErrorCode",
      code: this.value,
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

/** @internal */
export const makeUnchecked = (value: number): ErrorCode =>
  createProto(ErrorCodeProto, { value });

export const make = (
  value: number,
): Effect.Effect<ErrorCode, ErrorCodeTooLarge | ErrorCodeTooSmall> => {
  if (value < 1) {
    return Effect.fail(new ErrorCodeTooSmall({ received: value }));
  } else if (value > U16_MAX) {
    return Effect.fail(new ErrorCodeTooLarge({ received: value }));
  } else {
    return Effect.succeed(makeUnchecked(value));
  }
};

export const encode = encodeDual(
  (buffer: Buffer.WriteBuffer, errorCode: ErrorCode) =>
    Buffer.putU16(buffer, errorCode.value),
);

// no decode function, decoding is done through the ResponseKind.ts file

export const isErrorCode = (value: unknown): value is ErrorCode =>
  Predicate.hasProperty(value, TypeId);

export const arbitrary = (fc: typeof FastCheck) =>
  fc.integer({ min: 1, max: U16_MAX }).map(makeUnchecked);
