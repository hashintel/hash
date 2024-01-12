import {
  Data,
  Either,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
  Function,
} from "effect";
import * as equivalence from "effect/Equivalence";
import { pipeArguments } from "effect/Pipeable";
import { NodeInspectSymbol } from "effect/Inspectable";
import * as uuid from "uuid";
import { PCGRandom } from "effect/Utils";

export class InvalidUuidException extends Data.TaggedError("InvalidUuid") {}

const TypeId: unique symbol = Symbol.for("@local/schema/Uuid");
export type TypeId = typeof TypeId;

export type UuidInput = Uuid | string | Uint8Array;

export type UuidValue = Uint8Array;

export interface Uuid
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  readonly [TypeId]: TypeId;
  readonly value: UuidValue;
}

export namespace Uuid {
  export type Version = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export const isUuid = (value: unknown): value is Uuid =>
  Predicate.hasProperty(value, TypeId);

export const isVersion: {
  <const V extends Uuid.Version>(version: V): (self: UuidInput) => boolean;
  <const V extends Uuid.Version>(version: V, self: UuidInput): boolean;
} = Function.dual(
  2,
  <const V extends Uuid.Version>(self: UuidInput, version: V) => {
    const decoded = decode(self);
    return decoded.value[6] >> 4 === version;
  },
);

const UuidProto: Omit<Uuid, "value"> = {
  [TypeId]: TypeId,
  [Hash.symbol](this: Uuid): number {
    return Hash.structure(this.value);
  },
  [Equal.symbol](this: Uuid, that: unknown): boolean {
    return isUuid(that) && equals(this, that);
  },
  toString(this: Uuid): string {
    return toLowerHex(this);
  },
  toJSON(this: Uuid) {
    return {
      _id: "Uuid",
      value: toLowerHex(this),
    };
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return pipeArguments(this, arguments);
  },
};

const make = (input: Uint8Array): Uuid => {
  const impl = Object.create(UuidProto);
  impl.value = input;
  return impl;
};

export const fromString = (value: string) => {
  try {
    const bytes = uuid.parse(value);
    return Either.right(make(bytes));
  } catch (error) {
    return Either.left(new InvalidUuidException());
  }
};
export const fromBytes = (value: Uint8Array) => {
  if (value.length !== 16) {
    return Either.left(new InvalidUuidException());
  }

  return Either.right(make(value));
};

export const decodeEither = (
  value: UuidInput,
): Either.Either<InvalidUuidException, Uuid> => {
  if (isUuid(value)) {
    return Either.right(value);
  }

  if (Predicate.isString(value)) {
    return fromString(value);
  }

  if (Predicate.isUint8Array(value)) {
    return fromBytes(value);
  }

  return Either.left(new InvalidUuidException());
};

export const decode = (value: UuidInput): Uuid =>
  pipe(
    value,
    decodeEither,
    Either.getOrThrowWith(() => new Error("Invalid UUID input")),
  );

export const toLowerHex = (value: UuidInput) =>
  uuid.stringify(decode(value).value);
export const toUpperHex = (value: UuidInput) =>
  uuid.stringify(decode(value).value).toUpperCase();

export const format: (self: UuidInput) => string = toLowerHex;

export const Equivalence: equivalence.Equivalence<Uuid> = (self, that) =>
  self.value === that.value;

export const equals = (self: UuidInput, that: UuidInput) =>
  Equivalence(decode(self), decode(that));

export const NIL = make(new Uint8Array(16).fill(0));
export const MAX = make(new Uint8Array(16).fill(255));

const nsUuid =
  (fn: (name: string, namespace: string) => string, namespace: UuidInput) =>
  (name: string) =>
    fn(name, toLowerHex(decode(namespace)));

export const v1 = () => pipe(uuid.v1(), decode);

export const v3 = (name: string, namespace: UuidInput) =>
  pipe(name, nsUuid(uuid.v3, namespace), decode);

export const v4 = () => pipe(uuid.v4(), decode);

export const v5 = (name: string, namespace: UuidInput) =>
  pipe(name, nsUuid(uuid.v5, namespace), decode);

export const v6 = () => Function.absurd(1);

export const v7 = () => {
  const now = Date.now();
  const random = new PCGRandom();

  let pointer = 0;
  const buffer = new Uint8Array(16);

  const bytesNeeded = BigUint64Array.BYTES_PER_ELEMENT;
  const dataView = new DataView(new ArrayBuffer(bytesNeeded));
  dataView.setBigUint64(0, BigInt(now), false);

  // we're only interested in the lower 6 bytes
  for (let i = 2; i < bytesNeeded; i++) {
    buffer[pointer++] = dataView.getUint8(i);
  }

  // two bytes of random data
  const randA = random.integer(0);
  buffer[pointer++] = randA & 0xff;
  buffer[pointer++] = (randA >> 8) & 0xff;

  buffer[6] = (buffer[6] & 0x0f) | 0x70; // set version to 7

  // eight bytes of random data
  // (32 bit random)
  let randB = random.integer(0);
  for (let i = 0; i < 4; i++) {
    buffer[pointer++] = randB & 0xff;
    randB >>= 8;
  }

  randB = random.integer(0);
  for (let i = 0; i < 4; i++) {
    buffer[pointer++] = randB & 0xff;
    randB >>= 8;
  }

  // set first two bits of octet 8 to 0b10
  buffer[8] = (buffer[8] & 0x3f) | 0x80;

  return make(buffer);
};

// TODO: Schema
