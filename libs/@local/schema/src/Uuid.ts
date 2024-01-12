import { Data, Either, Equal, Inspectable, Pipeable } from "effect";

import * as Internal from "./internals/uuid";

export class InvalidUuidException extends Data.TaggedError("InvalidUuid") {}

const TypeId: unique symbol = Internal.UuidTypeId;
export type TypeId = typeof TypeId;

export interface Uuid
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  readonly [TypeId]: TypeId;
}

export namespace Uuid {
  export type Version = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export const isUuid: (value: unknown) => value is Uuid = Internal.isUuid;

export const isVersion: {
  <const V extends Uuid.Version>(version: V): (self: Uuid) => boolean;
  <const V extends Uuid.Version>(version: V, self: Uuid): boolean;
} = Internal.isVersion;

export const fromString: (
  value: string,
) => Either.Either<InvalidUuidException, Uuid> = Internal.fromString;
export const fromBytes: (
  value: Uint8Array,
) => Either.Either<InvalidUuidException, Uuid> = Internal.fromBytes;

export const toUpperHex: (value: Uuid) => string = Internal.toUpperHex;
export const toLowerHex: (value: Uuid) => string = Internal.toLowerHex;

export const NIL = Internal.NIL;
export const MAX = Internal.MAX;

export const v1: () => Uuid = Internal.v1;
export const v3: (name: string, namespace: Uuid) => Uuid = Internal.v3;
export const v4: () => Uuid = Internal.v4;
export const v5: (name: string, namespace: Uuid) => Uuid = Internal.v5;
