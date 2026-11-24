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
  const [enabled, setEnabled] = useState(false);
  const ensureFetched = useCallback(() => setEnabled(true), []);
  const { triggerSnackbar, closeSnackbar } = useSnackbar();
  const [dataTypes, setDataTypes] = useState<Record<
    VersionedUrl,
    DataTypeWithMetadata
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const refetch = useCallback(async () => {
    if (!mounted.current) {
      return;
    }
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);

    try {
      const catalogue = await queryDataTypeCatalogue(client, controller.signal);
      if (!controller.signal.aborted) {
        setDataTypes(catalogue);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause
            : new Error("Could not load data types", { cause }),
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [client]);

  useEffect(() => {
    mounted.current = true;
    if (enabled) {
      void refetch();
    }
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, [enabled, refetch]);

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
      ensureFetched,
      error,
      refetch,
      onDataTypeSaved,
    }),
    [
      dataTypes,
      latestDataTypes,
      loading,
      ensureFetched,
      error,
      refetch,
      onDataTypeSaved,
    ],
  );

  return (
    <DataTypesContext.Provider value={value}>
      {children}
    </DataTypesContext.Provider>
  );
};
