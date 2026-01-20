import { Match, Option, Pipeable, Predicate } from "effect";

import { createProto } from "../utils.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/binary/Bytes");

export type TypeId = typeof TypeId;

export type GrowthStrategy = "doubling" | "linear" | "exponential";
const DEFAULT_INITIAL_CAPACITY = 1024;

export interface MutableBytes extends Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
}

interface MutableBytesImpl extends MutableBytes {
  inner: ArrayBuffer;
  length: number;

  readonly initialCapacity: number;
  readonly growthStrategy: GrowthStrategy;
}

const MutableBytesProto: Omit<
  MutableBytesImpl,
  "inner" | "initialCapacity" | "growthStrategy"
> = {
  [TypeId]: TypeId,

  length: 0,

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

interface MakeOptions {
  /**
   * The initial capacity of the buffer.
   *
   * @defaultValue 1024
   */
  readonly initialCapacity?: number;
  /**
   * The strategy for growing the buffer when more space is needed.
   *
   * @defaultValue "doubling"
   */
  readonly growthStrategy?: GrowthStrategy;
}

export const make = (options?: MakeOptions): MutableBytes =>
  createProto(
    MutableBytesProto,
    {
      initialCapacity: options?.initialCapacity ?? DEFAULT_INITIAL_CAPACITY,
      growthStrategy: options?.growthStrategy ?? "doubling",
    },
    {
      inner: new ArrayBuffer(
        options?.initialCapacity ?? DEFAULT_INITIAL_CAPACITY,
      ),
    },
  ) satisfies MutableBytesImpl as MutableBytes;

interface FromOptions {
  /**
   * The strategy for growing the buffer when more space is needed.
   *
   * @defaultValue "doubling"
   */
  readonly growthStrategy?: GrowthStrategy;
}

export const from = (
  buffer: ArrayBuffer,
  options?: FromOptions,
): MutableBytes =>
  createProto(
    MutableBytesProto,
    {
      initialCapacity: buffer.byteLength,
      growthStrategy: options?.growthStrategy ?? "doubling",
    },
    {
      length: buffer.byteLength,
      inner: buffer,
    },
  ) satisfies MutableBytesImpl as MutableBytes;

export const capacity = (self: MutableBytes) =>
  (self as MutableBytesImpl).inner.byteLength;

export const length = (self: MutableBytes) => (self as MutableBytesImpl).length;

const allocate = (self: MutableBytes, newCapacity: number) => {
  if (newCapacity <= capacity(self)) {
    return self;
  }

  const impl = self as MutableBytesImpl;

  const newBuffer = new ArrayBuffer(newCapacity);

  new Uint8Array(newBuffer).set(new Uint8Array(impl.inner));
  impl.inner = newBuffer;

  return self;
};

const requiredCapacity = (self: MutableBytes, minimum: number) => {
  const impl = self as MutableBytesImpl;

  let next = capacity(impl);

  while (next < minimum) {
    next = Match.value(impl.growthStrategy).pipe(
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      Match.when(Match.is("doubling"), () => next * 2),
      Match.when(
        Match.is("linear"),

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        () =>
          next +
          // if the initialCapacity is 0 we should use the default, otherwise this turns into an infinite loop
          (impl.initialCapacity === 0
            ? DEFAULT_INITIAL_CAPACITY
            : impl.initialCapacity),
      ),
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      Match.when(Match.is("exponential"), () => next ** 2),
      Match.exhaustive,
    );
  }

  return next;
};

export const reserve = (self: MutableBytes, additional: number) => {
  return allocate(self, requiredCapacity(self, length(self) + additional));
};

export const require = (self: MutableBytes, byteLength: number) => {
  allocate(self, requiredCapacity(self, byteLength));

  const impl = self as MutableBytesImpl;

  impl.length = byteLength;

  return self;
};

export const asBuffer = (self: MutableBytes) => {
  const impl = self as MutableBytesImpl;

  return impl.inner.slice(0, length(self));
};

export const asArray = (self: MutableBytes) => {
  const impl = self as MutableBytesImpl;

  return new Uint8Array(impl.inner, 0, length(self));
};

export const asDataView = (self: MutableBytes) => {
  const impl = self as MutableBytesImpl;

  return new DataView(impl.inner, 0, length(self));
};

export const appendArray = (
  self: MutableBytes,
  ...bytes: readonly Uint8Array[]
) => {
  const impl = self as MutableBytesImpl;

  if (bytes.length === 0) {
    return self;
  }

  const totalLength = bytes.reduce(
    (accumulator, b) => accumulator + b.byteLength,
    0,
  );

  reserve(self, totalLength);

  for (const array of bytes) {
    new Uint8Array(impl.inner).set(array, impl.length);
    impl.length = impl.length + array.byteLength;
  }

  return self;
};

export const appendBuffer = (
  self: MutableBytes,
  ...buffers: readonly ArrayBuffer[]
) => appendArray(self, ...buffers.map((buffer) => new Uint8Array(buffer)));

export const append = (
  self: MutableBytes,
  ...other: readonly MutableBytes[]
) => {
  const impl = self as MutableBytesImpl;

  if (other.length === 0) {
    return self;
  }

  const totalLength = other.reduce(
    (accumulator, b) => accumulator + length(b),
    0,
  );

  reserve(self, totalLength);

  for (const array of other) {
    new Uint8Array(impl.inner).set(asArray(array), impl.length);
    impl.length = impl.length + length(array);
  }

  return self;
};

/**
 * Split the bytes object, so that bytes object contains `[at,length)` and the rest is returned as a new bytes object.
 */
export const splitTo = (self: MutableBytes, at: number) => {
  if (at > length(self)) {
    return Option.none();
  }

  const impl = self as MutableBytesImpl;

  const destination = make({
    initialCapacity: at,
    growthStrategy: impl.growthStrategy,
  });

  appendBuffer(destination, impl.inner.slice(0, at));

  impl.inner = impl.inner.slice(at);
  impl.length = impl.length - at;

  return Option.some(destination);
};

export const isBytes = (value: unknown): value is MutableBytes =>
  Predicate.hasProperty(value, TypeId);
