interface MemoizableFetchFunction<T> {
  (url: string, signal?: AbortSignal): Promise<T>;
}

/**
 * Memoize a fetch function by its URL.
 */
export function memoizeFetchFunction<T>(
  fetchFunction: MemoizableFetchFunction<T>
): MemoizableFetchFunction<T> {
  const cache: Record<string, any> = {};

  return async (url, signal) => {

    if (cache[url] == null) {
      const result = await fetchFunction(url, signal);
      cache[url] = result;
    }

    return cache[url];
  };
}