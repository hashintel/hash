import { useQuery } from "@apollo/client";
import { GlobalStyles } from "@mui/system";
import { NextSeo } from "next-seo";
import { useMemo, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  compareOntologyTypeVersions,
  extractVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypeSubgraphQuery } from "../../graphql/queries/ontology/data-type.queries";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { Link } from "../../shared/ui/link";
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import { DataTypeDrawer } from "../types/data-type-drawer";
import { DataTypeForm } from "../types/data-type-form";
import { useDataTypesContext } from "./data-types-context";
import { DataTypesLoadError } from "./data-types-load-error";
import { DsComponentsScope } from "./ds-components-scope";
import { NotFound } from "./not-found";
import { TypeEditorSkeleton } from "./shared/type-editor-skeleton";
import { TopContextBar } from "./top-context-bar";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { DataTypeFormProps } from "../types/data-type-form";
import type { DataTypeRootType } from "@blockprotocol/graph";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  OntologyTypeVersion,
} from "@blockprotocol/type-system";
import type { Theme } from "@mui/material";

/**
 * The data-type editor hosted directly on a page rather than in its drawer:
 * resolves the loaded types the form needs (with their loading and error
 * states), and scopes the subtree for the ds components the form is built
 * from. Nested editors (extending types, staged group members) still open in
 * stacked drawers above the page.
 */
export const PageDataTypeForm = (
  props: Omit<
    DataTypeFormProps,
    "variant" | "swapKey" | "StackedDrawer" | "dataTypes" | "latestDataTypes"
  >,
) => {
  const {
    dataTypes,
    latestDataTypes,
    error: dataTypesError,
  } = useDataTypesContext();

  if (!dataTypes || !latestDataTypes) {
    return dataTypesError ? <DataTypesLoadError /> : <TypeEditorSkeleton />;
  }

  return (
    <DsComponentsScope overlayStackRoot>
      <DataTypeForm
        variant="page"
        swapKey="data-type-page-editor"
        StackedDrawer={DataTypeDrawer}
        dataTypes={dataTypes}
        latestDataTypes={latestDataTypes}
        {...props}
      />
    </DsComponentsScope>
  );
};

type DataTypeProps = {
  dataTypeBaseUrl: BaseUrl;
  requestedVersion: OntologyTypeVersion | null;
  onDataTypeUpdated: (dataType: DataTypeWithMetadata) => void;
};

export const DataType = ({
  dataTypeBaseUrl,
  requestedVersion,
  onDataTypeUpdated,
}: DataTypeProps) => {
  const { refetch: refetchAllDataTypes } = useDataTypesContext();

  /** Bumped to remount the form on a fresh baseline (cancel, same-$id saves) */
  const [formGeneration, setFormGeneration] = useState(0);

  /**
   * The just-saved type: the save remounts the form before the remote-type
   * refetch lands, so the remount must seed from the saved edition rather
   * than the still-stale query result
   */
  const [lastSaved, setLastSaved] = useState<DataTypeWithMetadata | null>(null);

  const {
    loading: loadingRemoteDataType,
    data: remoteDataTypeData,
    refetch: refetchRemoteType,
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
      fetchPolicy: "cache-and-network",
    },
  );

  const { remoteDataType, latestVersionNumber: latestVersion } = useMemo<{
    remoteDataType: DataTypeWithMetadata | null;
    latestVersionNumber: OntologyTypeVersion | null;
  }>(() => {
    if (!remoteDataTypeData) {
      return { remoteDataType: null, latestVersionNumber: null };
    }

    const dataTypes = getRoots<DataTypeRootType>(
      deserializeQueryDataTypeSubgraphResponse(
        remoteDataTypeData.queryDataTypeSubgraph,
      ).subgraph,
    );

    let highestVersionDataType: DataTypeWithMetadata | null = null;
    let matchedDataType: DataTypeWithMetadata | null = null;
    for (const dataType of dataTypes) {
      const version = extractVersion(dataType.schema.$id);
      if (
        !highestVersionDataType ||
        compareOntologyTypeVersions(
          version,
          highestVersionDataType.metadata.recordId.version,
        ) > 0
      ) {
        highestVersionDataType = dataType;
      }
      if (version === requestedVersion) {
        matchedDataType = dataType;
      }
    }

    if (!highestVersionDataType) {
      return { remoteDataType: null, latestVersionNumber: null };
    }

    // No version in the URL means the latest; only an explicitly requested
    // version that doesn't exist is not found
    if (requestedVersion && !matchedDataType) {
      return {
        remoteDataType: null,
        latestVersionNumber: highestVersionDataType.metadata.recordId.version,
      };
    }

    return {
      remoteDataType: matchedDataType ?? highestVersionDataType,
      latestVersionNumber: highestVersionDataType.metadata.recordId.version,
    };
  }, [remoteDataTypeData, requestedVersion]);

  const dataType = remoteDataType;

  const { userPermissions, loading: loadingUserPermissions } =
    useUserPermissionsOnDataType(dataType?.schema.$id);

  if (!dataType && !loadingRemoteDataType && !loadingUserPermissions) {
    return (
      <NotFound
        resourceLabel={{
          label: latestVersion ? "data type version" : "data type",
          withArticle: latestVersion ? "a version" : "a data type",
        }}
        additionalText={
          latestVersion && dataTypeBaseUrl ? (
            <>
              The latest version can be found{" "}
              <Link
                href={
                  generateLinkParameters(
                    versionedUrlFromComponents(dataTypeBaseUrl, latestVersion),
                  ).href
                }
              >
                here
              </Link>
              .
            </>
          ) : undefined
        }
      />
    );
  }

  if (loadingUserPermissions || loadingRemoteDataType) {
    return <TypeEditorSkeleton />;
  }

  if (!dataType) {
    throw new Error("Cannot render data type without data type");
  }

  const isLatest =
    !requestedVersion ||
    (latestVersion !== null &&
      compareOntologyTypeVersions(requestedVersion, latestVersion) === 0);

  // Editing always targets the latest version; older ones are a record
  const isReadOnly = !userPermissions?.edit || !isLatest;

  return (
    <>
      <NextSeo title={`${dataType.schema.title} | Data Type`} />

      <TopContextBar
        defaultCrumbIcon={null}
        item={dataType}
        crumbs={[
          {
            href: "/types",
            title: "Types",
            id: "types",
          },
          {
            href: "/types/data-type",
            title: "Data Types",
            id: "data-types",
          },
          {
            title: dataType.schema.title,
            id: dataType.schema.$id,
          },
        ]}
        onItemUnarchived={() => {
          void refetchRemoteType();
          void refetchAllDataTypes();
        }}
        scrollToTop={() => {}}
        sx={{ bgcolor: "white" }}
      />

      <PageDataTypeForm
        key={`${dataType.schema.$id}-${formGeneration}`}
        // Navigates to the picked version's page; non-latest renders read-only
        onSwitchVersion={onDataTypeUpdated}
        editedDataType={
          lastSaved?.schema.$id === dataType.schema.$id ? lastSaved : dataType
        }
        readonly={isReadOnly}
        onClose={() => setFormGeneration((generation) => generation + 1)}
        onSaved={(saved) => {
          setLastSaved(saved);
          // A save that doesn't republish this type keeps its $id, so the
          // route won't remount the page — reset to the saved baseline here.
          // A new version navigates instead: remounting now would flash the
          // stale pre-save edition until the route lands.
          if (saved.schema.$id === dataType.schema.$id) {
            setFormGeneration((generation) => generation + 1);
          }
          void refetchRemoteType();
          onDataTypeUpdated(saved);
        }}
      />

      <GlobalStyles<Theme>
        styles={(theme) => ({
          body: {
            minHeight: "100vh",
            background: theme.palette.gray[10],
          },
        })}
      />
    </>
  );
};
