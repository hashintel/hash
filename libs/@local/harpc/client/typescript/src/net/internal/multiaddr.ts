import {
  isMultiaddr,
  type Multiaddr,
  type MultiaddrInput,
  type ResolveOptions,
} from "@multiformats/multiaddr";
import { Equal, Hash, pipe } from "effect";

import { createProto, hashUint8Array } from "../../utils.js";

const MultiaddrSymbol = Symbol.for("@multiformats/js-multiaddr/multiaddr");
type MultiaddrSymbol = typeof MultiaddrSymbol;

/** @internal */
export interface HashableMultiaddr extends Multiaddr, Equal.Equal {
  readonly [MultiaddrSymbol]: true;
  readonly inner: Multiaddr;
}

const HashableMultiaddrProto: Omit<HashableMultiaddr, "inner"> = {
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

  toOptions(this: HashableMultiaddr) {
    return this.inner.toOptions();
  },

  protos(this: HashableMultiaddr) {
    return this.inner.protos();
  },

  protoCodes(this: HashableMultiaddr) {
    return this.inner.protoCodes();
  },

  protoNames(this: HashableMultiaddr) {
    return this.inner.protoNames();
  },

  tuples(this: HashableMultiaddr) {
    return this.inner.tuples();
  },

  stringTuples(this: HashableMultiaddr) {
    return this.inner.stringTuples();
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

  getPeerId(this: HashableMultiaddr) {
    return this.inner.getPeerId();
  },

  getPath(this: HashableMultiaddr) {
    return this.inner.getPath();
  },

  equals(this: HashableMultiaddr, other: HashableMultiaddr) {
    return this.inner.equals(other.inner);
  },

  resolve(this: HashableMultiaddr, options?: ResolveOptions) {
    return this.inner.resolve(options);
  },

  nodeAddress(this: HashableMultiaddr) {
    return this.inner.nodeAddress();
  },

  isThinWaistAddress(this: HashableMultiaddr) {
    return this.inner.isThinWaistAddress();
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

/** @internal */
export const make = (inner: Multiaddr): HashableMultiaddr =>
  createProto(HashableMultiaddrProto, {
    inner,
  }) satisfies HashableMultiaddr;
