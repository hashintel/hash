/** One signature-bound set of requests that have not settled yet. */
export interface InflightRequestBinding<Key, Value> {
  readonly signature: string;
  readonly entries: Map<Key, Promise<Value>>;
}

/**
 * Return `binding` when its signature matches, otherwise create an empty successor.
 *
 * The returned object can replace a React ref's current value. Keeping that write
 * at the call site leaves this helper pure and its binding behavior testable.
 */
export const inflightRequestBindingFor = <Key, Value>(
  binding: InflightRequestBinding<Key, Value>,
  signature: string,
): InflightRequestBinding<Key, Value> =>
  binding.signature === signature ? binding : { signature, entries: new Map() };

/**
 * Share one pending request and remove it from the same map on either settlement
 * path.
 *
 * Cleanup captures `entries` rather than consulting a live binding ref. A request
 * retired by a binding change can therefore clean only its old map, never install
 * or mutate the successor map. The promise identity guard preserves a replacement
 * request for the same key.
 */
export const shareInflightRequest = <Key, Value>(
  entries: Map<Key, Promise<Value>>,
  key: Key,
  request: () => Promise<Value>,
): Promise<Value> => {
  const existing = entries.get(key);
  if (existing) {
    return existing;
  }

  const promise = request();
  entries.set(key, promise);

  const removeSettled = () => {
    if (entries.get(key) === promise) {
      entries.delete(key);
    }
  };
  void promise.then(removeSettled, removeSettled);

  return promise;
};
