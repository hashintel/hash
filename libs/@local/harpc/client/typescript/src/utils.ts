import { Function, Record, Tuple } from "effect";

import type * as Buffer from "./wire-protocol/Buffer.js";

export const createProto = <
  T extends object,
  ReadableProperties extends Readonly<Record<string, unknown>>,
  WriteableProperties extends Readonly<Record<string, unknown>>,
>(
  proto: T,
  readableProperties: ReadableProperties,
  writeableProperties?: WriteableProperties,
): T & ReadableProperties & WriteableProperties => {
  const readablePropertyDescriptors = Record.map(
    readableProperties,
    (value): PropertyDescriptor => ({
      enumerable: true,
      configurable: false,
      writable: false,
      value,
    }),
  );

  const writeablePropertyDescriptors = Record.map(
    writeableProperties ?? {},
    (value): PropertyDescriptor => ({
      enumerable: true,
      configurable: false,
      writable: true,
      value,
    }),
  );

  return Object.create(
    proto,
    Record.union(
      readablePropertyDescriptors,
      writeablePropertyDescriptors,
      Function.untupled(Tuple.getFirst),
    ),
  ) as T & ReadableProperties & WriteableProperties;
};

// This is more strictly typed than necessary, but this allows us to give better type hints
export const encodeDual: <U, E extends Buffer.UnexpectedEndOfBufferError>(
  closure: (buffer: Buffer.WriteBuffer, self: U) => Buffer.WriteResult<E>,
) => {
  (self: U): (buffer: Buffer.WriteBuffer) => Buffer.WriteResult<E>;
  (buffer: Buffer.WriteBuffer, self: U): Buffer.WriteResult<E>;
} = (closure) => Function.dual(2, closure as (...args: unknown[]) => unknown);
