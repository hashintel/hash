import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  compareOntologyTypeVersions,
  extractBaseUrl,
} from "@blockprotocol/type-system";
import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypeSubgraphQuery } from "../../graphql/queries/ontology/data-type.queries";
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import { DataTypeEditorDrawer } from "./data-type-editor-drawer";
import { useDataTypesContext } from "./data-types-context";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { DataTypeRootType } from "@blockprotocol/graph";
import type {
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The data-type editor drawer for anywhere that has only a type's id — it
 * resolves the latest version from the loaded types, falling back to a graph
 * query for types not held locally, and opens read-only without edit
 * permission.
 */
export const DataTypeEditorDrawerById = ({
  dataTypeId,
  swapKey = "data-type-editor",
  onClose,
}: {
  dataTypeId: VersionedUrl;
  /** Distinct per stacked drawer, so each level animates in and out on its own */
  swapKey?: string;
  onClose: () => void;
}) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();

  const dataTypeBaseUrl = extractBaseUrl(dataTypeId);

  const fromContext =
    latestDataTypes?.[dataTypeBaseUrl] ?? dataTypes?.[dataTypeId] ?? null;

  const {
    data: remoteData,
    loading: remoteLoading,
    error: remoteError,
  } = useQuery<QueryDataTypeSubgraphQuery, QueryDataTypeSubgraphQueryVariables>(
    queryDataTypeSubgraphQuery,
    {
      variables: {
        request: {
          filter: {
            equal: [{ path: ["baseUrl"] }, { parameter: dataTypeBaseUrl }],
          },
          temporalAxes: fullTransactionTimeAxis,
          graphResolveDepths: {
            inheritsFrom: 255,
            constrainsValuesOn: 255,
          },
          traversalPaths: [],
        },
      },
      skip: fromContext !== null,
      fetchPolicy: "cache-and-network",
    },
  );

  const fetched = useMemo<DataTypeWithMetadata | null>(() => {
    if (!remoteData) {
      return null;
    }

    let latest: DataTypeWithMetadata | null = null;
    for (const dataType of getRoots<DataTypeRootType>(
      deserializeQueryDataTypeSubgraphResponse(remoteData.queryDataTypeSubgraph)
        .subgraph,
    )) {
      if (
        !latest ||
        compareOntologyTypeVersions(
          dataType.metadata.recordId.version,
          latest.metadata.recordId.version,
        ) > 0
      ) {
        latest = dataType;
      }
    }
    return latest;
  }, [remoteData]);

  const dataType = fromContext ?? fetched;

  const { userPermissions } = useUserPermissionsOnDataType(
    dataType?.schema.$id,
  );

  /**
   * Permissions deliberately don't gate the editor: it opens read-only and
   * enables editing when they resolve. Waiting for them would remount the
   * drawer mid-enter, visibly restarting its slide-in. The load mode keeps
   * the drawer slot mounted for the same reason.
   */
  if (!dataType) {
    return (
      <DataTypeEditorDrawer
        mode="load"
        notFound={
          !remoteLoading &&
          (remoteData !== undefined || remoteError !== undefined)
        }
        swapKey={swapKey}
        onClose={onClose}
      />
    );
  }

  return (
    <DataTypeEditorDrawer
      mode="edit"
      dataType={dataType}
      readonly={!userPermissions?.edit}
      swapKey={swapKey}
      onClose={onClose}
      onUpdated={() => onClose()}
    />
  );
};
