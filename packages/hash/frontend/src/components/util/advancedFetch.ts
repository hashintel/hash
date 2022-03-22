export const advancedFetch = (
  input: RequestInfo,
  init?: RequestInit | undefined,
) => {
  const controller = new AbortController();
  const signal = controller.signal;

  return {
    abort: () => controller.abort(),
    ready: fetch(input, { ...init, signal }),
  };
};
