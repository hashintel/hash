import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * `react-router`-compatible `useSearchParams`, backed by browser history.
 *
 * Keeps the existing call sites (`const [params, setParams] = useSearchParams()`)
 * unchanged during the framework swap. View-state lives in the query string and
 * is intentionally updated without Next routing, so changing a view parameter
 * never re-runs page effects or remounts the supply-chain layout. No-op writes
 * are ignored so repeated effects or clicks do not enqueue redundant updates.
 */
type NextInit =
  | URLSearchParams
  | Record<string, string>
  | ((prev: URLSearchParams) => URLSearchParams);

type SetURLSearchParams = (
  nextInit?: NextInit,
  navigateOpts?: { replace?: boolean },
) => void;

const searchParamsChangeEvent = "supply-chain-search-params-change";

const queryStringFromBrowser = () =>
  typeof window === "undefined" ? "" : window.location.search.slice(1);

export function useSearchParams(): [URLSearchParams, SetURLSearchParams] {
  const router = useRouter();
  const routerQueryString = router.asPath.split("?")[1] ?? "";
  const [optimisticQueryString, setOptimisticQueryString] = useState(
    () => queryStringFromBrowser() || routerQueryString,
  );

  useEffect(() => {
    setOptimisticQueryString(queryStringFromBrowser() || routerQueryString);
  }, [routerQueryString]);

  useEffect(() => {
    const syncFromLocation = () => {
      setOptimisticQueryString(queryStringFromBrowser());
    };
    const syncFromEvent = (event: Event) => {
      setOptimisticQueryString(
        event instanceof CustomEvent &&
          typeof event.detail?.queryString === "string"
          ? event.detail.queryString
          : queryStringFromBrowser(),
      );
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener(searchParamsChangeEvent, syncFromEvent);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener(searchParamsChangeEvent, syncFromEvent);
    };
  }, []);

  const searchParams = useMemo(
    () => new URLSearchParams(optimisticQueryString),
    [optimisticQueryString],
  );

  const setSearchParams = useCallback<SetURLSearchParams>(
    (nextInit, navigateOpts) => {
      const resolved =
        typeof nextInit === "function"
          ? nextInit(new URLSearchParams(optimisticQueryString))
          : new URLSearchParams(nextInit as Record<string, string> | undefined);

      const path = router.asPath.split("?")[0];
      if (!path) {
        return;
      }
      const qs = resolved.toString();
      if (qs === optimisticQueryString) {
        return;
      }

      if (typeof window === "undefined") {
        return;
      }

      const url = `${path}${qs ? `?${qs}` : ""}${window.location.hash}`;
      setOptimisticQueryString(qs);
      const updateHistory = navigateOpts?.replace
        ? window.history.replaceState
        : window.history.pushState;
      updateHistory.call(window.history, window.history.state, "", url);
      window.dispatchEvent(
        new CustomEvent(searchParamsChangeEvent, {
          detail: { queryString: qs },
        }),
      );
    },
    [router.asPath, optimisticQueryString],
  );

  return [searchParams, setSearchParams];
}
