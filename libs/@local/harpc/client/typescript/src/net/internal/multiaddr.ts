import {
  isMultiaddr,
  type Multiaddr,
  type MultiaddrInput,
} from "@multiformats/multiaddr";
import { Equal, Hash, pipe, Predicate } from "effect";

import { createProto, hashUint8Array } from "../../utils.js";

const MultiaddrSymbol = Symbol.for("@multiformats/js-multiaddr/multiaddr");

type MultiaddrSymbol = typeof MultiaddrSymbol;

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/net/internal/HashableMultiaddr",
);

type TypeId = typeof TypeId;

/** @internal */
export interface HashableMultiaddr extends Multiaddr, Equal.Equal {
  readonly [TypeId]: TypeId;
  readonly [MultiaddrSymbol]: true;
  readonly inner: Multiaddr;
}

const HashableMultiaddrProto: Omit<HashableMultiaddr, "inner"> = {
  [TypeId]: TypeId,
  [MultiaddrSymbol]: true,

  get bytes() {
    return (this as HashableMultiaddr).inner.bytes;
  },

  toString(this: HashableMultiaddr) {
    return this.inner.toString();
  },

  toJSON(this: HashableMultiaddr) {
    return this.inner.toString();
  },

  getComponents(this: HashableMultiaddr) {
    return this.inner.getComponents();
  },

  encapsulate(this: HashableMultiaddr, addr: MultiaddrInput) {
    return this.inner.encapsulate(addr);
  },

  decapsulate(this: HashableMultiaddr, addr: Multiaddr | string) {
    return this.inner.decapsulate(addr);
  },

  decapsulateCode(this: HashableMultiaddr, code: number) {
    return this.inner.decapsulateCode(code);
  },

  equals(this: HashableMultiaddr, other: HashableMultiaddr) {
    return this.inner.equals(other.inner);
  },

  [Equal.symbol](this: HashableMultiaddr, other: unknown) {
    return isMultiaddr(other) && this.inner.equals(other);
  },

  [Hash.symbol](this: HashableMultiaddr) {
    return pipe(
      Hash.hash(MultiaddrSymbol),
      Hash.combine(hashUint8Array(this.bytes)),
      Hash.cached(this),
    );
  },
};

const isHashableMultiaddr = (value: unknown): value is HashableMultiaddr =>
  Predicate.hasProperty(value, TypeId);

/** @internal */
export const make = (inner: Multiaddr): HashableMultiaddr =>
  isHashableMultiaddr(inner)
    ? inner
    : (createProto(HashableMultiaddrProto, {
        inner,
      }) satisfies HashableMultiaddr);
