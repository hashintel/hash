import { Function, Record } from "effect";

import type * as Buffer from "./wire-protocol/Buffer.js";

export const createProto = <
  T extends object,
  P extends Readonly<Record<string, unknown>>,
>(
  proto: T,
  properties: P,
): T & P => {
  return Object.create(
    proto,
    Record.map(
      properties,
      (value): PropertyDescriptor => ({
        enumerable: true,
        configurable: false,
        writable: false,
        value,
      }),
    ),
  ) as T & P;
};

// This is more strictly typed than necessary, but this allows us to give better type hints
export const encodeDual: <U, E extends Buffer.UnexpectedEndOfBufferError>(
  closure: (buffer: Buffer.WriteBuffer, value: U) => Buffer.WriteResult<E>,
) => {
  (value: U): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult<E>;
  (buffer: Buffer.WriteBuffer, value: U): Buffer.WriteResult<E>;
} = (closure) => Function.dual(2, closure as (...args: unknown[]) => unknown);
