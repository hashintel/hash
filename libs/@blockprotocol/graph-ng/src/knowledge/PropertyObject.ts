import {
  Brand,
  Equal,
  Function,
  Hash,
  Inspectable,
  Option,
  Pipeable,
  Predicate,
} from "effect";

import * as BaseUrl from "../BaseUrl";
import { NodeInspectSymbol } from "effect/Inspectable";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bag<V = any> = Record<string, V>;
type UnknownBag = Bag<unknown>;
type BagEntry<T> = T extends Record<infer K, infer V> ? [K, V] : never;

export interface PropertyObject<out T extends Bag>
  extends Iterable<BagEntry<T>>,
    Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  readonly [TypeId]: TypeId;
}

interface PropertyObjectImpl<out T extends Bag> extends PropertyObject<T> {
  values: T;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace PropertyObject {}

const PropertyObjectProto: PropertyObject<UnknownBag> = {
  [TypeId]: TypeId,
  [Hash.symbol](this: PropertyObjectImpl<UnknownBag>): number {
    const hash = Hash.combine(Hash.hash(TypeId))(Hash.hash(this.values));

    return Hash.cached(this, hash);
  },
  [Equal.symbol](this: PropertyObjectImpl<UnknownBag>, that: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (!isPropertyObject(that)) {
      return false;
    }

    // only implementation is `PropertyObjectImpl`, so we can safely cast here
    const thisValues = this.values;
    const thatValues = (that as PropertyObjectImpl<UnknownBag>).values;

    if (Object.keys(thisValues).length !== Object.keys(thatValues).length) {
      return false;
    }

    return Equal.equals(thisValues, thatValues);
  },
  toString<T extends Bag>(this: PropertyObjectImpl<T>): string {
    return Inspectable.format(this.toJSON());
  },
  toJSON<T extends Bag>(this: PropertyObjectImpl<T>) {
    return {
      _id: "PropertyObject",
      values: Object.fromEntries(
        Object.entries(this.values).map(([key, value]) => [
          key,
          Inspectable.toJSON(value),
        ]),
      ),
    };
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },

  [Symbol.iterator]<T extends Bag>(
    this: PropertyObjectImpl<T>,
  ): Iterator<BagEntry<T>> {
    return Object.entries(this.values)[Symbol.iterator]() as Iterator<
      BagEntry<T>
    >;
  },
};

export const make = <T extends Bag>(values: T): PropertyObject<T> => {
  const object = Object.create(PropertyObjectProto) as PropertyObjectImpl<T>;
  object.values = values;
  return object;
};

export const isPropertyObject = (
  value: unknown,
): value is PropertyObject<UnknownBag> => {
  return Predicate.hasProperty(value, TypeId);
};

// TODO: BaseUrl cannot be used to index, so we need to get the keys and then unbrand them,
//  check if included, and then rebrand again.

export const get = Function.dual<
  <K1 extends BaseUrl.BaseUrl>(
    key: K1,
  ) => <T extends Bag>(
    self: PropertyObject<T>,
  ) => Brand.Brand.Unbranded<K1> extends keyof T
    ? T[Brand.Brand.Unbranded<K1>]
    : never,
  <T extends Bag, K1 extends BaseUrl.BaseUrl>(
    self: PropertyObject<T>,
    key: K1,
  ) => Brand.Brand.Unbranded<K1> extends keyof T
    ? T[Brand.Brand.Unbranded<K1>]
    : never
>(2, (self, key) => {
  return (self as PropertyObjectImpl<Bag>).values[key as string];
});

// export const index = Function.dual<
//   <T extends Bag, K extends keyof T>(
//     key: K,
//   ) => (self: PropertyObject<T>) => T[K],
//   <T extends Bag, K extends keyof T>(self: PropertyObject<T>, key: K) => T[K]
// >(2, <T extends Bag, K extends keyof T>(self: PropertyObject<T>, key: K) => {
//   return self.values[key];
// });

// get is same as index, but(!) with `Option` return type and less strict typing
