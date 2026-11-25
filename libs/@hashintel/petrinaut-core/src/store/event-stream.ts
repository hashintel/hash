/**
 * A stream of events a caller subscribes to. Where a `ReadableStore` holds a
 * current value, a stream holds none: a listener receives the events emitted
 * while it is subscribed, and `subscribe` returns the function that ends it.
 */
export type EventStream<T> = {
  subscribe(listener: (event: T) => void): () => void;
};
