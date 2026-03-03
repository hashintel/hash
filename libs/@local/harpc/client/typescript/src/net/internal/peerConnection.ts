import {
  type AbortOptions,
  type Connection,
  connectionSymbol,
  type EventHandler,
  type NewStreamOptions,
} from "@libp2p/interface";
import { Equal, Hash, Inspectable, pipe, Pipeable, Predicate } from "effect";

import { createProto } from "../../utils.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/net/internal/PeerConnection",
);

type TypeId = typeof TypeId;

/** @internal */
export interface PeerConnection
  extends Connection,
    Inspectable.Inspectable,
    Equal.Equal,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly [connectionSymbol]: true;
  readonly inner: Connection;
}

const PeerConnectionProto: Omit<PeerConnection, "inner"> = {
  [TypeId]: TypeId,
  [connectionSymbol]: true,

  get id() {
    return (this as PeerConnection).inner.id;
  },

  get remoteAddr() {
    return (this as PeerConnection).inner.remoteAddr;
  },

  get remotePeer() {
    return (this as PeerConnection).inner.remotePeer;
  },

  get streams() {
    return (this as PeerConnection).inner.streams;
  },

  get direction() {
    return (this as PeerConnection).inner.direction;
  },

  get timeline() {
    return (this as PeerConnection).inner.timeline;
  },

  get multiplexer() {
    return (this as PeerConnection).inner.multiplexer;
  },

  get encryption() {
    return (this as PeerConnection).inner.encryption;
  },

  get status() {
    return (this as PeerConnection).inner.status;
  },

  get direct() {
    return (this as PeerConnection).inner.direct;
  },

  get limits() {
    return (this as PeerConnection).inner.limits;
  },

  get rtt() {
    return (this as PeerConnection).inner.rtt;
  },

  get log() {
    return (this as PeerConnection).inner.log;
  },

  newStream(protocols: string | string[], options?: NewStreamOptions) {
    return (this as PeerConnection).inner.newStream(protocols, options);
  },

  close(options: AbortOptions = {}) {
    return (this as PeerConnection).inner.close(options);
  },

  abort(error: Error) {
    (this as PeerConnection).inner.abort(error);
  },

  addEventListener(event, listener, options) {
    (this as PeerConnection).inner.addEventListener(event, listener, options);
  },

  listenerCount(event) {
    return (this as PeerConnection).inner.listenerCount(event);
  },

  removeEventListener(
    event: string,
    listener: EventHandler<unknown>,
    // eslint-disable-next-line fsecond/no-inline-interfaces
    options: boolean | { capture?: boolean } | undefined,
  ) {
    (this as PeerConnection).inner.removeEventListener(
      event,
      listener,
      options,
    );
  },

  dispatchEvent(event) {
    return (this as PeerConnection).inner.dispatchEvent(event);
  },

  safeDispatchEvent(event, detail) {
    return (this as PeerConnection).inner.safeDispatchEvent(event, detail);
  },

  [Equal.symbol](this: PeerConnection, that: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return isPeerConnection(that) && this.id === that.id;
  },

  [Hash.symbol](this: PeerConnection): number {
    return pipe(
      Hash.hash(TypeId),
      Hash.combine(Hash.string(this.id)),
      Hash.cached(this),
    );
  },

  toString(this: PeerConnection) {
    return `PeerConnection(${this.id})`;
  },

  toJSON(this: PeerConnection) {
    return {
      _id: "PeerConnection",
      id: this.id,
    };
  },

  [Inspectable.NodeInspectSymbol](this: PeerConnection) {
    return this.toString();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

const isPeerConnection = (value: unknown): value is PeerConnection =>
  Predicate.hasProperty(value, TypeId);

/** @internal */
export const make = (inner: Connection): PeerConnection =>
  isPeerConnection(inner)
    ? inner
    : (createProto(PeerConnectionProto, { inner }) satisfies PeerConnection);
