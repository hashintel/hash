import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useMemoCompare } from "../../shared/use-memo-compare";
import { useAuthInfo } from "../shared/auth-info-context";
import { useActiveWorkspace } from "../shared/workspace-context";
import {
  CostParamsContext,
  DEFAULT_CURRENCY,
  DEFAULT_STORAGE_COST,
  DEFAULT_WACC,
  OutlierContext,
} from "./shared/cost";
import {
  configureDataSource,
  fetchProducts,
  fetchSites,
  type SiteRef,
} from "./shared/data";
import { DocsProvider } from "./shared/docs/docs-context";
import { SupplyChainAppSkeleton } from "./shared/load-state";
import { LowSampleContext } from "./shared/low-sample-context";
import {
  BASE_MEASURES,
  MeasureContext,
  type BaseMeasure,
} from "./shared/measure-context";
import {
  PROCUREMENT_BASES,
  ProcurementBasisContext,
  type ProcurementBasis,
} from "./shared/procurement-basis-context";
import { RegistryContext } from "./shared/registry-context";
import { LOCAL_SCOPE, ScopeContext } from "./shared/scope-context";
import { trackSupplyChainInteraction } from "./shared/telemetry";
import { TimeRangeContext } from "./shared/time-range-context";
import { useSearchParams } from "./shared/use-search-params";
import { useSupplyChainUserPreferences } from "./shared/use-supply-chain-user-preferences";

import type { TimeRange } from "./shared/time-range";
import type { Product } from "./shared/types";
import type { WebId } from "@blockprotocol/type-system";

const screenBg = css({
  display: "flex",
  flexDirection: "column",
  h: "full",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "full",
  bg: "bgSolid.min",
});

const errorStack = css({
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const errorTitle = css({ fontWeight: "medium", textStyle: "lg" });
const subtleSm = css({ color: "fg.subtle" });
const emptyText = css({ color: "fg.subtle" });
const mainArea = css({
  flex: "1",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "[1800px]",
  mx: "auto",
  display: "flex",
  flexDirection: "column",
});

const getOrderedWebIds = (webIds: (WebId | null | undefined)[]): WebId[] => {
  const orderedWebIds: WebId[] = [];

  for (const webId of webIds) {
    if (webId && !orderedWebIds.includes(webId)) {
      orderedWebIds.push(webId);
    }
  }

  return orderedWebIds;
};

function normaliseTimeRange(
  value: string | null,
  fallback: TimeRange = "12m",
): TimeRange {
  if (value === "3m" || value === "6m" || value === "12m") {
    return value;
  }
  return fallback;
}

function normaliseWacc(value: string | null): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 50) {
    return parsed / 100;
  }
  return DEFAULT_WACC;
}

function normaliseStorageCost(
  value: string | null,
  defaultStorageCost: number,
): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 10) {
    return parsed;
  }
  return defaultStorageCost;
}

function normaliseDefaultStorageCost(value: number | null | undefined): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 10
  ) {
    return value;
  }
  return DEFAULT_STORAGE_COST;
}

function normaliseCurrency(value: string | null | undefined): string {
  const currency = value?.trim().toUpperCase();
  return currency == null || currency === "" ? DEFAULT_CURRENCY : currency;
}

function normaliseMeasure(value: string | null): BaseMeasure {
  if (BASE_MEASURES.includes(value as BaseMeasure)) {
    return value as BaseMeasure;
  }
  return "median";
}

function normaliseProcurementBasis(value: string | null): ProcurementBasis {
  if (PROCUREMENT_BASES.includes(value as ProcurementBasis)) {
    return value as ProcurementBasis;
  }
  return "first";
}

export const SupplyChainDataShell = ({
  children,
  scope = LOCAL_SCOPE,
}: {
  children: ReactNode;
  /** Data scope for the HASH analysis gateway. */
  scope?: WebId;
}) => {
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [dataScope, setDataScope] = useState<WebId>(scope);
  const [defaultCurrency, setDefaultCurrency] = useState(DEFAULT_CURRENCY);
  const [defaultStorageCost, setDefaultStorageCost] =
    useState(DEFAULT_STORAGE_COST);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    loading: userPreferencesLoading,
    settings: userPreferenceSettings,
    saveSettings: saveUserPreferenceSettings,
  } = useSupplyChainUserPreferences();

  const { authenticatedUser } = useAuthInfo();
  const { activeWorkspace } = useActiveWorkspace();

  // Avoid full reloads when the user object but not its web memberships change.
  const candidateWebIds = useMemoCompare(
    () =>
      getOrderedWebIds([
        scope,
        ...(authenticatedUser?.memberOf.map(({ org }) => org.webId) ?? []),
        authenticatedUser?.accountId as WebId | undefined,
      ]),
    [authenticatedUser, scope],
    (previous, next) => {
      const previousSet = new Set(previous);
      const nextSet = new Set(next);
      return (
        previousSet.size === nextSet.size && previousSet.isSupersetOf(nextSet)
      );
    },
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const waccRate = normaliseWacc(searchParams.get("wacc"));
  const storageCost = normaliseStorageCost(
    searchParams.get("storage"),
    defaultStorageCost,
  );
  const excludeOutliers =
    userPreferenceSettings.excludeOutliers ??
    searchParams.get("outliers") !== "include";
  const measure = normaliseMeasure(searchParams.get("measure"));
  const procurementBasis = normaliseProcurementBasis(
    searchParams.get("procurement"),
  );
  const timeRange = normaliseTimeRange(
    userPreferenceSettings.timeRange ?? searchParams.get("range"),
  );
  const excludeLowSamples =
    userPreferenceSettings.excludeLowSamples ??
    searchParams.get("lowSamples") === "exclude";

  const setQueryParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value == null) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setWaccRate = useCallback(
    (rate: number) => {
      trackSupplyChainInteraction({
        interaction: "wacc_changed",
        source: "analysis_settings",
      });
      setQueryParam(
        "wacc",
        rate === DEFAULT_WACC ? null : String(Math.round(rate * 100)),
      );
    },
    [setQueryParam],
  );

  const setStorageCost = useCallback(
    (cost: number) => {
      trackSupplyChainInteraction({
        interaction: "storage_cost_changed",
        source: "analysis_settings",
      });
      setQueryParam(
        "storage",
        cost === defaultStorageCost ? null : String(cost),
      );
    },
    [defaultStorageCost, setQueryParam],
  );

  const setAnalysisSettings = useCallback(
    (
      settings:
        | { currency?: string | null; storage_cost?: number | null }
        | null
        | undefined,
    ) => {
      setDefaultCurrency(normaliseCurrency(settings?.currency));
      setDefaultStorageCost(
        normaliseDefaultStorageCost(settings?.storage_cost),
      );
    },
    [],
  );

  const setExcludeOutliers = useCallback(
    (exclude: boolean) => {
      trackSupplyChainInteraction({
        interaction: exclude ? "outliers_excluded" : "outliers_included",
        source: "analysis_settings",
      });
      saveUserPreferenceSettings({ excludeOutliers: exclude });
    },
    [saveUserPreferenceSettings],
  );

  const setExcludeLowSamples = useCallback(
    (exclude: boolean) => {
      trackSupplyChainInteraction({
        interaction: exclude ? "low_samples_excluded" : "low_samples_included",
        source: "analysis_settings",
      });
      saveUserPreferenceSettings({ excludeLowSamples: exclude });
    },
    [saveUserPreferenceSettings],
  );

  const setMeasure = useCallback(
    (nextMeasure: BaseMeasure) => {
      trackSupplyChainInteraction({
        interaction: "measure_changed",
        source: "analysis_settings",
      });
      setQueryParam("measure", nextMeasure === "median" ? null : nextMeasure);
    },
    [setQueryParam],
  );

  const setProcurementBasis = useCallback(
    (basis: ProcurementBasis) => {
      trackSupplyChainInteraction({
        interaction: "procurement_basis_changed",
        source: "analysis_settings",
      });
      setQueryParam("procurement", basis === "first" ? null : basis);
    },
    [setQueryParam],
  );

  const setTimeRange = useCallback(
    (range: TimeRange) => {
      trackSupplyChainInteraction({
        interaction: "time_range_changed",
        source: "analysis_settings",
      });
      saveUserPreferenceSettings({ timeRange: range });
    },
    [saveUserPreferenceSettings],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const loadRegistry = async () => {
      let lastError: unknown = null;

      for (const candidateWebId of candidateWebIds) {
        if (isCancelled()) {
          return;
        }

        configureDataSource({ scope: candidateWebId });

        try {
          const [candidateProducts, candidateSiteRefs] = await Promise.all([
            fetchProducts(),
            fetchSites(),
          ]);

          if (candidateProducts.length === 0) {
            lastError = new Error("No supply chain products found.");
            continue;
          }

          if (isCancelled()) {
            return;
          }

          setDataScope(candidateWebId);
          setProducts(candidateProducts);
          setSites(candidateSiteRefs);
          setLoading(false);
          return;
        } catch (caught) {
          lastError = caught;
        }
      }

      if (isCancelled()) {
        return;
      }

      configureDataSource({ scope });
      setDataScope(scope);
      setProducts([]);
      setSites([]);
      setError(
        lastError instanceof Error
          ? lastError.message
          : typeof lastError === "string"
            ? lastError
            : "No supply chain data found.",
      );
      setLoading(false);
    };

    setLoading(true);
    setError(null);
    void loadRegistry();

    return () => {
      cancelled = true;
    };
  }, [candidateWebIds, scope]);

  const demoActive = products.some((product) => product.id === "_demo");
  const scopeContextValue = useMemo(() => ({ scope: dataScope }), [dataScope]);
  const registryContextValue = useMemo(
    () => ({ products, sites, demoActive }),
    [demoActive, products, sites],
  );
  const costContextValue = useMemo(
    () => ({
      currency: defaultCurrency,
      setAnalysisSettings,
      waccRate,
      setWaccRate,
      storageCost,
      setStorageCost,
    }),
    [
      defaultCurrency,
      setAnalysisSettings,
      setStorageCost,
      setWaccRate,
      storageCost,
      waccRate,
    ],
  );
  const outlierContextValue = useMemo(
    () => ({ excludeOutliers, setExcludeOutliers }),
    [excludeOutliers, setExcludeOutliers],
  );
  const lowSampleContextValue = useMemo(
    () => ({ excludeLowSamples, setExcludeLowSamples }),
    [excludeLowSamples, setExcludeLowSamples],
  );
  const measureContextValue = useMemo(
    () => ({ measure, setMeasure }),
    [measure, setMeasure],
  );
  const procurementBasisContextValue = useMemo(
    () => ({ basis: procurementBasis, setBasis: setProcurementBasis }),
    [procurementBasis, setProcurementBasis],
  );
  const timeRangeContextValue = useMemo(
    () => ({ timeRange, setTimeRange }),
    [setTimeRange, timeRange],
  );

  if (!mounted || loading || userPreferencesLoading) {
    return <SupplyChainAppSkeleton className={screenBg} />;
  }

  if (error) {
    return (
      <div style={{ marginTop: 30, marginLeft: 30 }}>
        <div className={errorStack}>
          <p className={errorTitle}>
            No supply chain data found in{" "}
            <strong>
              {activeWorkspace?.shortname
                ? `@${activeWorkspace.shortname}`
                : "this web"}
            </strong>
          </p>
          <p className={subtleSm}>
            Use the web switcher in the top left to switch to a different web.
          </p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div style={{ marginTop: 30, marginLeft: 30 }}>
        <p className={emptyText}>
          No supply chain products are available in this workspace.
        </p>
      </div>
    );
  }

  return (
    <ScopeContext.Provider value={scopeContextValue}>
      <RegistryContext.Provider value={registryContextValue}>
        <CostParamsContext.Provider value={costContextValue}>
          <OutlierContext.Provider value={outlierContextValue}>
            <LowSampleContext.Provider value={lowSampleContextValue}>
              <MeasureContext.Provider value={measureContextValue}>
                <ProcurementBasisContext.Provider
                  value={procurementBasisContextValue}
                >
                  <TimeRangeContext.Provider value={timeRangeContextValue}>
                    <DocsProvider>
                      <div className={screenBg}>
                        <main className={mainArea}>{children}</main>
                      </div>
                    </DocsProvider>
                  </TimeRangeContext.Provider>
                </ProcurementBasisContext.Provider>
              </MeasureContext.Provider>
            </LowSampleContext.Provider>
          </OutlierContext.Provider>
        </CostParamsContext.Provider>
      </RegistryContext.Provider>
    </ScopeContext.Provider>
  );
};
