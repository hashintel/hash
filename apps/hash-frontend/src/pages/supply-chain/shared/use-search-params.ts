import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * `react-router`-compatible `useSearchParams`, backed by `next/router`.
 *
 * Keeps the existing call sites (`const [params, setParams] = useSearchParams()`)
 * unchanged during the framework swap. View-state lives in the query string and
 * updates route with `shallow: true`, so changing a param never re-runs the
 * page's data fetching — matching the SPA's previous behaviour where the router
 * did not remount on a search-param change.
 */
type NextInit =
  | URLSearchParams
  | Record<string, string>
  | ((prev: URLSearchParams) => URLSearchParams);

type SetURLSearchParams = (
  nextInit?: NextInit,
  navigateOpts?: { replace?: boolean },
) => void;

export function useSearchParams(): [URLSearchParams, SetURLSearchParams] {
  const router = useRouter();
  const queryString = router.asPath.split("?")[1] ?? "";
  const [optimisticQueryString, setOptimisticQueryString] =
    useState(queryString);

  useEffect(() => {
    setOptimisticQueryString(queryString);
  }, [queryString]);

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
      const url = qs ? `${path}?${qs}` : path;
      setOptimisticQueryString(qs);
      const navigate = navigateOpts?.replace ? router.replace : router.push;
      void navigate.call(router, url, undefined, { shallow: true });
    },
    [router, optimisticQueryString],
  );

  return [searchParams, setSearchParams];
}
