import { useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";

import { compareOntologyTypeVersions } from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
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
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const {
    data,
    loading: queryLoading,
    refetch,
    fetchMore,
  } = useQuery<QueryDataTypesQuery, QueryDataTypesQueryVariables>(
    queryDataTypesQuery,
    {
      fetchPolicy: "cache-first",
      notifyOnNetworkStatusChange: true,
      variables: {
        request: {
          filter: { all: [] },
          temporalAxes: fullTransactionTimeAxis,
          limit: 1000,
        },
      },
    },
  );

  const cursor = data?.queryDataTypes.cursor;
  const loading = queryLoading || !!cursor;

  useEffect(() => {
    if (!cursor || queryLoading || paginationError) {
      return;
    }
    void fetchMore({
      variables: {
        request: {
          filter: { all: [] },
          temporalAxes: fullTransactionTimeAxis,
          limit: 1000,
          after: cursor,
        },
      },
      updateQuery: (previous, { fetchMoreResult }) => ({
        ...previous,
        queryDataTypes: {
          ...fetchMoreResult.queryDataTypes,
          dataTypes: [
            ...previous.queryDataTypes.dataTypes,
            ...fetchMoreResult.queryDataTypes.dataTypes,
          ],
        },
      }),
    }).catch((error: unknown) => {
      setPaginationError(
        error instanceof Error
          ? error
          : new Error("Could not load the remaining data types"),
      );
    });
  }, [cursor, fetchMore, paginationError, queryLoading]);

  const { dataTypes, latestDataTypes } = useMemo(() => {
    if (!data || cursor) {
      return {
        dataTypes: null,
        latestDataTypes: null,
      };
    }

    const all: Record<VersionedUrl, DataTypeWithMetadata> = {};
    const latest: Record<BaseUrl, DataTypeWithMetadata> = {};

    for (const dataType of data.queryDataTypes.dataTypes) {
      const { baseUrl, version } = dataType.metadata.recordId;
      const previous = latest[baseUrl];
      all[dataType.schema.$id] = dataType;
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

    return { dataTypes: all, latestDataTypes: latest };
  }, [data, cursor]);

  const value = useMemo(() => {
    return {
      dataTypes,
      latestDataTypes,
      loading,
      refetch,
    };
  }, [dataTypes, latestDataTypes, loading, refetch]);

  if (paginationError) {
    throw paginationError;
  }

  return (
    <DataTypesContext.Provider value={value}>
      {children}
    </DataTypesContext.Provider>
  );
};
