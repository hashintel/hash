interface MemoizableFetchFunction<T> {
  (url: string, signal?: AbortSignal): T;
}

/**
 * Memoize a fetch function by its URL.
 */
export function memoizeFetchFunction<T>(
  fetchFunction: MemoizableFetchFunction<T>
): MemoizableFetchFunction<T> {
  const cache: Record<string, any> = {};

  return (url, signal) => {

    if (cache[url] == null) {
      cache[url] = fetchFunction(url, signal);
    }

    return cache[url];
  };
}