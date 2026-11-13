import { useApolloClient } from "@apollo/client";
import { captureException } from "@sentry/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { compareOntologyTypeVersions } from "@blockprotocol/type-system";

import { useSnackbar } from "../../components/hooks/use-snackbar";
import { Button } from "../../shared/ui/button";
import { DataTypesContext } from "./data-types-context";
import { queryDataTypeCatalogue } from "./data-types-context-provider/query-data-type-catalogue";

import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

export const DataTypesContextProvider = ({ children }: PropsWithChildren) => {
  const client = useApolloClient();
  const { triggerSnackbar, closeSnackbar } = useSnackbar();
  const [dataTypes, setDataTypes] = useState<Record<
    VersionedUrl,
    DataTypeWithMetadata
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshId, setRefreshId] = useState(0);
  const [refreshResult, setRefreshResult] = useState<{
    signal: AbortSignal;
    success: boolean;
  } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const refreshWaiters = useRef<((success: boolean) => void)[]>([]);
  const mounted = useRef(false);

  useEffect(() => {
    const waiters = refreshWaiters.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const resolve of waiters.splice(0)) {
        resolve(false);
      }
    };
  }, []);

  useEffect(() => {
    if (refreshResult && !refreshResult.signal.aborted) {
      for (const resolve of refreshWaiters.current.splice(0)) {
        resolve(refreshResult.success);
      }
    }
  }, [refreshResult]);

  const refetch = useCallback((): Promise<boolean> => {
    if (!mounted.current) {
      return Promise.resolve(false);
    }
    activeRequest.current?.abort();
    setLoading(true);
    setError(null);
    setRefreshId((previous) => previous + 1);
    return new Promise((resolve) => {
      refreshWaiters.current.push(resolve);
    });
  }, []);

  const onDataTypeSaved = useCallback(
    (dataType: DataTypeWithMetadata) => {
      setDataTypes((previous) =>
        previous ? { ...previous, [dataType.schema.$id]: dataType } : previous,
      );
      void refetch();
    },
    [refetch],
  );

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;

    const load = async () => {
      try {
        const catalogue = await queryDataTypeCatalogue(
          client,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }

        setDataTypes(catalogue);
        setLoading(false);
        setRefreshResult({ signal: controller.signal, success: true });
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          cause instanceof Error
            ? cause
            : new Error("Could not load data types", { cause }),
        );
        setLoading(false);
        setRefreshResult({ signal: controller.signal, success: false });
      }
    };

    void load();
    return () => controller.abort();
  }, [client, refreshId]);

  useEffect(() => {
    if (!error) {
      return;
    }
    captureException(error);
    const key = uuid();
    triggerSnackbar.error("Could not refresh data types. Try again.", {
      key,
      persist: true,
      action: (
        <Button
          size="small"
          variant="tertiary_quiet"
          onClick={() => {
            void refetch();
          }}
          sx={{ color: "inherit" }}
        >
          Retry
        </Button>
      ),
    });
    return () => closeSnackbar(key);
  }, [error, triggerSnackbar, closeSnackbar, refetch]);

  const latestDataTypes = useMemo(() => {
    if (!dataTypes) {
      return null;
    }
    const latest: Record<BaseUrl, DataTypeWithMetadata> = {};
    for (const dataType of Object.values(dataTypes)) {
      const { baseUrl, version } = dataType.metadata.recordId;
      const previous = latest[baseUrl];
      if (
        !previous ||
        compareOntologyTypeVersions(
          version,
          previous.metadata.recordId.version,
        ) > 0
      ) {
        latest[baseUrl] = dataType;
      }
    }
    return latest;
  }, [dataTypes]);

  const value = useMemo(
    () => ({
      dataTypes,
      latestDataTypes,
      loading,
      error,
      refetch,
      onDataTypeSaved,
    }),
    [dataTypes, latestDataTypes, loading, error, refetch, onDataTypeSaved],
  );

  return (
    <DataTypesContext.Provider value={value}>
      {children}
    </DataTypesContext.Provider>
  );
};
