interface MemoizableFetchFunction<T> {
  (url: string, signal?: AbortSignal): Promise<T>;
}

/**
 * Memoize a fetch function by its URL.
 */
export function memoizeFetchFunction<T>(
  fetchFunction: MemoizableFetchFunction<T>,
): MemoizableFetchFunction<T> {
  const cache: Record<string, Promise<any>> = {};

  return async (url, signal) => {
    if (cache[url] == null) {
      let fulfilled = false;
      const promise = fetchFunction(url, signal);

      promise
        .then(() => {
          fulfilled = true;
        })
        .catch(() => {
          if (cache[url] === promise) {
            delete cache[url];
          }
        });

      signal?.addEventListener("abort", () => {
        if (cache[url] === promise && !fulfilled) {
          delete cache[url];
        }
      });

      cache[url] = promise;
    }

    return await cache[url];
  };
}
