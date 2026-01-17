import { Function, Hash, Record, Tuple } from "effect";

import type { MutableBuffer } from "./binary/index.js";

export const createProto = <
  T extends object,
  ReadableProperties extends Readonly<Record<string, unknown>>,
  WriteableProperties extends Readonly<Record<string, unknown>>,
>(
  proto: T,
  readableProperties: ReadableProperties,
  writeableProperties?: WriteableProperties,
): T & Readonly<ReadableProperties> & WriteableProperties => {
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
  ) as T & Readonly<ReadableProperties> & WriteableProperties;
};

/**
 * This is more strictly typed than necessary, but this allows us to give better type hints.
 */
export const implEncode: <
  U,
  E extends MutableBuffer.UnexpectedEndOfBufferError,
>(
  closure: (
    buffer: MutableBuffer.WriteBuffer,
    self: U,
  ) => MutableBuffer.WriteResult<E>,
  // eslint-disable-next-line fsecond/no-inline-interfaces
) => {
  (
    self: U,
  ): (buffer: MutableBuffer.WriteBuffer) => MutableBuffer.WriteResult<E>;
  (buffer: MutableBuffer.WriteBuffer, self: U): MutableBuffer.WriteResult<E>;
} = (closure) => Function.dual(2, closure as (...args: unknown[]) => unknown);

/**
 * This is more strictly typed than necessary, but this allows us to give better type hints.
 */
export const implDecode: <U, E>(
  closure: (buffer: MutableBuffer.ReadBuffer) => MutableBuffer.ReadResult<U, E>,
) => (buffer: MutableBuffer.ReadBuffer) => MutableBuffer.ReadResult<U, E> = (
  closure,
) => closure;

export const hashUint8Array = (array: Uint8Array) => {
  // same as array, so initial state is the same
  let state = 6151;

  // we take the array in steps of 4, and then just hash the 4 bytes
  const remainder = array.length % 4;

  // because they're just numbers and the safe integer range is 2^53 - 1,
  // we can just take it in 32 bit chunks, which means we need to do less overall.
  for (let i = 0; i < array.length - remainder; i = i + 4) {
    const value =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      array[i]! |
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (array[i + 1]! << 8) |
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (array[i + 2]! << 16) |
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (array[i + 3]! << 24);

    state = Hash.combine(value)(state);
  }

  // if there are any remaining bytes, we hash them as well
  for (let i = array.length - remainder; i < array.length; i = i + 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    state = Hash.combine(array[i]!)(state);
  }

  return Hash.optimize(state);
};
