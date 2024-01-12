import * as crypto from "node:crypto";

import { Either, Equal, Hash, pipe, Predicate } from "effect";
import * as Dual from "effect/Function";
import { NodeInspectSymbol } from "effect/Inspectable";
import { pipeArguments } from "effect/Pipeable";
import uuid from "uuid";

import * as Public from "../Uuid";

const UuidSymbolKey = "@local/schema/Uuid";

export const UuidTypeId: Public.TypeId = Symbol.for(
  UuidSymbolKey,
) as Public.TypeId;

export interface UuidImpl extends Public.Uuid {
  _value: Uint8Array;
}

const UuidProto: Public.Uuid = {
  [UuidTypeId]: UuidTypeId,
  [Hash.symbol](): number {
    return pipe(
      Hash.hash(UuidTypeId),
      Hash.combine(Hash.hash((this as UuidImpl)._value)),
    );
  },
  [Equal.symbol](this: UuidImpl, that: unknown): boolean {
    if (isUuid(that)) {
      return (that as UuidImpl)._value === this._value;
    }

    return false;
  },
  toString(): string {
    return toLowerHex(this);
  },
  toJSON() {
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

export const makeImpl = (value: Uint8Array): Public.Uuid => {
  const impl = Object.create(UuidProto);
  impl._value = value;
  return impl;
};

export const fromString = (
  value: string,
): Either.Either<Public.InvalidUuidException, Public.Uuid> => {
  try {
    const bytes = uuid.parse(value);
    return Either.right(makeImpl(bytes));
  } catch (error) {
    return Either.left(new Public.InvalidUuidException());
  }
};

export const fromBytes = (
  value: Uint8Array,
): Either.Either<Public.InvalidUuidException, Public.Uuid> => {
  if (value.length !== 16) {
    return Either.left(new Public.InvalidUuidException());
  }

  return Either.right(makeImpl(value));
};

export const isUuid = (value: unknown): value is Public.Uuid =>
  Predicate.hasProperty(value, UuidTypeId);

export const isVersion = Dual.dual<
  <const V extends Public.Uuid.Version>(
    version: V,
  ) => (self: Public.Uuid) => boolean,
  <const V extends Public.Uuid.Version>(
    self: Public.Uuid,
    version: V,
  ) => boolean
>(2, (self, version) => {
  const bytes = (self as UuidImpl)._value;
  return bytes[6] >> 4 === version;
});

export const toLowerHex = (value: Public.Uuid): crypto.UUID =>
  uuid.stringify((value as UuidImpl)._value) as crypto.UUID;

export const toUpperHex = (value: Public.Uuid): crypto.UUID =>
  toLowerHex(value).toUpperCase() as crypto.UUID;

export const NIL: Public.Uuid = makeImpl(new Uint8Array(16).fill(0));
export const MAX: Public.Uuid = makeImpl(new Uint8Array(16).fill(255));

export const v1 = (): Public.Uuid => {
  const value = uuid.v1();

  // SAFETY: This should never throw, uuid returns a valid UUID
  return Either.getOrThrow(fromString(value));
};

export const v3 = (name: string, namespace: Public.Uuid): Public.Uuid => {
  const value = uuid.v3(name, toLowerHex(namespace));

  // SAFETY: This should never throw, uuid returns a valid UUID
  return Either.getOrThrow(fromString(value));
};

export const v4 = (): Public.Uuid => {
  const value = crypto.randomUUID();

  // SAFETY: This should never throw, crypto returns a valid UUID
  return Either.getOrThrow(fromString(value));
};

export const v5 = (name: string, namespace: Public.Uuid): Public.Uuid => {
  const value = uuid.v5(name, toLowerHex(namespace));

  // SAFETY: This should never throw, uuid returns a valid UUID
  return Either.getOrThrow(fromString(value));
};
