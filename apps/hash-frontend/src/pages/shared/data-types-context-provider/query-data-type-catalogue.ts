import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypesQuery } from "../../../graphql/queries/ontology/data-type.queries";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { ApolloClient } from "@apollo/client";
import type {
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const queryDataTypeCatalogue = async (
  client: ApolloClient<object>,
  signal: AbortSignal,
): Promise<Record<VersionedUrl, DataTypeWithMetadata>> => {
  const catalogue: Record<VersionedUrl, DataTypeWithMetadata> = {};
  const cursors = new Set<VersionedUrl>();
  let after: VersionedUrl | undefined;

  do {
    signal.throwIfAborted();
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
      errorPolicy: "none",
      context: {
        queryDeduplication: false,
        fetchOptions: { signal },
      },
    });
    signal.throwIfAborted();

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

  return catalogue;
};
