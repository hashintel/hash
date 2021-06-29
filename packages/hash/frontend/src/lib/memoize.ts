interface MemoizableFetchFunction<T> {
  (url: string, signal?: AbortSignal): Promise<T>;
}

/**
 * Memoize a fetch function by its URL.
 */
export function memoizeFetchFunction<T>(
  fetchFunction: MemoizableFetchFunction<T>
): MemoizableFetchFunction<T> {
  const cache: Record<string, Promise<any>> = {};

  return async (url, signal) => {
    if (cache[url] == null) {
      const promise = fetchFunction(url, signal);
      signal?.addEventListener("abort", () => {
        if (cache[url] === promise) {
          delete cache[url];
        }
      });

      cache[url] = promise;
    }

    return await cache[url];
  };
}
