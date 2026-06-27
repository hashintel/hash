import { useSearchParams } from "./use-search-params";

/**
 * Feature flags for the supply-chain views.
 *
 * A flag resolves from a query param so experimental views can be enabled or
 * hidden per URL without changing the app-wide supply-chain feature flag.
 */

function parseBoolish(value: string | null | undefined): boolean | null {
  if (value == null) {
    return null;
  }
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "on":
    case "yes":
      return true;
    case "0":
    case "false":
    case "off":
    case "no":
      return false;
    default:
      return null;
  }
}

/**
 * Supplier Performance is an experimental view (dashboard card, tab + table,
 * and vendor drill-down). It is hidden by default; enable it with
 * `?supplierPerformance=1`.
 */
export function useSupplierPerformanceEnabled(): boolean {
  const [searchParams] = useSearchParams();
  const fromQuery = parseBoolish(searchParams.get("supplierPerformance"));
  if (fromQuery != null) {
    return fromQuery;
  }

  return false;
}
