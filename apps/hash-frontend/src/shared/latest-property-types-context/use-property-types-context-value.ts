import { useApolloClient } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";

import { queryPropertyTypesQuery } from "../../graphql/queries/ontology/property-type.queries";
import { queryAllPropertyTypes } from "./use-property-types-context-value/query-all-property-types";

import type { QueryPropertyTypesQuery } from "../../graphql/api-types.gen";
import type { PropertyTypesContextValues } from "../property-types-context";

export const usePropertyTypesContextValue = (params?: {
  includeArchived?: boolean;
  enabled?: boolean;
}) => {
  const { includeArchived = false, enabled = true } = params ?? {};
  const client = useApolloClient();
  const requestGeneration = useRef(0);
  const [propertyTypes, setPropertyTypes] =
    useState<PropertyTypesContextValues["propertyTypes"]>(null);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setError(null);
    try {
      const allPropertyTypes = await queryAllPropertyTypes(
        async (request) => {
          const response = await client.query<QueryPropertyTypesQuery>({
            query: queryPropertyTypesQuery,
            variables: { request },
            fetchPolicy: "network-only",
          });
          return response.data.queryPropertyTypes;
        },
        {
          filter: { all: [] },
          temporalAxes: includeArchived
            ? fullTransactionTimeAxis
            : currentTimeInstantTemporalAxes,
          limit: 1000,
        },
      );
      if (requestGeneration.current === generation) {
        setPropertyTypes(allPropertyTypes);
      }
    } catch (cause) {
      if (requestGeneration.current === generation) {
        setError(
          cause instanceof Error
            ? cause
            : new Error("Could not load the property types"),
        );
      }
      throw cause;
    }
  }, [client, includeArchived]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void fetch().catch(() => {
      // The error is surfaced during rendering, through the error boundary.
    });
    return () => {
      requestGeneration.current += 1;
    };
  }, [fetch, enabled]);

  const result = useMemo(
    () => ({ refetch: fetch, propertyTypes }),
    [fetch, propertyTypes],
  );
  if (error) {
    throw error;
  }
  return result;
};
