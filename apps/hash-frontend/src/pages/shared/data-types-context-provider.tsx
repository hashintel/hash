import { useApolloClient } from "@apollo/client";
import { captureException } from "@sentry/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { compareOntologyTypeVersions } from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { useSnackbar } from "../../components/hooks/use-snackbar";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { Button } from "../../shared/ui/button";
import { DataTypesContext } from "./data-types-context";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
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
    id: number;
    success: boolean;
  } | null>(null);
  const requestedRefresh = useRef(0);
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
    if (refreshResult?.id === requestedRefresh.current) {
      for (const resolve of refreshWaiters.current.splice(0)) {
        resolve(refreshResult.success);
      }
    }
  }, [refreshResult]);

  const refetch = useCallback((): Promise<boolean> => {
    if (!mounted.current) {
      return Promise.resolve(false);
    }
    requestedRefresh.current += 1;
    setLoading(true);
    setError(null);
    setRefreshId(requestedRefresh.current);
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
    const isCurrent = () =>
      !controller.signal.aborted && requestedRefresh.current === refreshId;

    const load = async () => {
      const catalogue: Record<VersionedUrl, DataTypeWithMetadata> = {};
      const cursors = new Set<VersionedUrl>();
      let after: VersionedUrl | undefined;

      try {
        do {
          const { data } = await client.query<
            QueryDataTypesQuery,
            QueryDataTypesQueryVariables
          >({
            query: queryDataTypesQuery,
            variables: {
              request: {
                filter: { all: [] },
                temporalAxes: fullTransactionTimeAxis,
                limit: 1000,
                ...(after ? { after } : {}),
              },
            },
            fetchPolicy: "no-cache",
            context: {
              queryDeduplication: false,
              fetchOptions: { signal: controller.signal },
            },
          });

          if (!isCurrent()) {
            return;
          }

          for (const dataType of data.queryDataTypes.dataTypes) {
            catalogue[dataType.schema.$id] = dataType;
          }

          after = data.queryDataTypes.cursor;
          if (after) {
            if (cursors.has(after)) {
              throw new Error(`Data type pagination repeated cursor ${after}`);
            }
            cursors.add(after);
          }
        } while (after);

        setDataTypes(catalogue);
        setLoading(false);
        setRefreshResult({ id: refreshId, success: true });
      } catch (cause) {
        if (!isCurrent()) {
          return;
        }
        setError(
          cause instanceof Error
            ? cause
            : new Error("Could not load data types", { cause }),
        );
        setLoading(false);
        setRefreshResult({ id: refreshId, success: false });
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
    () => ({ dataTypes, latestDataTypes, loading, refetch, onDataTypeSaved }),
    [dataTypes, latestDataTypes, loading, refetch, onDataTypeSaved],
  );

  return (
    <DataTypesContext.Provider value={value}>
      {children}
    </DataTypesContext.Provider>
  );
};
