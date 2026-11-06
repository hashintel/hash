import { useQuery } from "@apollo/client";
import { Box, Container, Stack } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { NextSeo } from "next-seo";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

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
import { DataTypeEditorDrawer } from "./data-type-editor-drawer";
import { DataTypeConstraints } from "./data-type/data-type-constraints";
import { DataTypeConversions } from "./data-type/data-type-conversions";
import {
  type DataTypeFormData,
  getFormDataFromDataType,
} from "./data-type/data-type-form";
import { DataTypeHeader } from "./data-type/data-type-header";
import { DataTypeLabels } from "./data-type/data-type-labels";
import { DataTypesParents } from "./data-type/data-type-parents";
import { InheritedConstraintsProvider } from "./data-type/shared/inherited-constraints-provider";
import { useDataTypesContext } from "./data-types-context";
import { NotFound } from "./not-found";
import { inSlideContainerStyles } from "./shared/slide-styles";
import { TypeEditorSkeleton } from "./shared/type-editor-skeleton";
import { TypeDefinitionContainer } from "./shared/type-editor-styling";
import { typeHeaderContainerStyles } from "./shared/type-header-container-styles";
import { useSlideStack } from "./slide-stack";
import { TopContextBar } from "./top-context-bar";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { DataTypeRootType } from "@blockprotocol/graph";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  OntologyTypeVersion,
} from "@blockprotocol/type-system";
import type { Theme } from "@mui/material";

type DataTypeProps = {
  isInSlide?: boolean;
  dataTypeBaseUrl?: BaseUrl;
  requestedVersion: OntologyTypeVersion | null;
  onDataTypeUpdated: (dataType: DataTypeWithMetadata) => void;
};

export const DataType = ({
  isInSlide: inSlide,
  dataTypeBaseUrl,
  requestedVersion,
  onDataTypeUpdated,
}: DataTypeProps) => {
  const { refetch: refetchAllDataTypes } = useDataTypesContext();

  const [showEditDrawer, setShowEditDrawer] = useState(false);

  const formMethods = useForm<DataTypeFormData>({
    defaultValues: {
      allOf: [],
      abstract: false,
      constraints: {},
      label: {},
      title: "",
    },
  });

  const { control } = formMethods;

  const abstract = useWatch({
    control,
    name: "abstract",
  });

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

  const {
    remoteDataType,
    latestDataType,
    latestVersionNumber: latestVersion,
  } = useMemo<{
    remoteDataType: DataTypeWithMetadata | null;
    latestDataType: DataTypeWithMetadata | null;
    latestVersionNumber: OntologyTypeVersion | null;
  }>(() => {
    if (!remoteDataTypeData) {
      return {
        remoteDataType: null,
        latestDataType: null,
        latestVersionNumber: null,
      };
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
      return {
        remoteDataType: null,
        latestDataType: null,
        latestVersionNumber: null,
      };
    }

    if (!requestedVersion || !matchedDataType) {
      return {
        remoteDataType: null,
        latestDataType: highestVersionDataType,
        latestVersionNumber: highestVersionDataType.metadata.recordId.version,
      };
    }

    return {
      remoteDataType: matchedDataType,
      latestDataType: highestVersionDataType,
      latestVersionNumber: highestVersionDataType.metadata.recordId.version,
    };
  }, [remoteDataTypeData, requestedVersion]);

  useEffect(() => {
    if (remoteDataType) {
      formMethods.reset(getFormDataFromDataType(remoteDataType));
    }
  }, [remoteDataType, formMethods]);

  const dataType = remoteDataType;

  const { userPermissions, loading: loadingUserPermissions } =
    useUserPermissionsOnDataType(dataType?.schema.$id);

  const { pushToSlideStack } = useSlideStack();

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

  if (!dataType || !userPermissions) {
    throw new Error("Cannot render data type without data type");
  }

  const currentVersion = extractVersion(dataType.schema.$id);

  // Editing always applies to the latest version, whichever version is viewed
  const canEdit = userPermissions.edit;

  return (
    <>
      {!inSlide && <NextSeo title={`${dataType.schema.title} | Data Type`} />}
      <FormProvider {...formMethods}>
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
            refetchAllDataTypes();
          }}
          scrollToTop={() => {}}
          sx={{ bgcolor: "white" }}
        />

        <Box sx={typeHeaderContainerStyles}>
          <Container sx={inSlide ? inSlideContainerStyles : {}}>
            <DataTypeHeader
              currentVersion={currentVersion}
              dataTypeSchema={dataType.schema}
              isInSlide={inSlide}
              isReadOnly
              latestVersion={latestVersion}
              onEdit={canEdit ? () => setShowEditDrawer(true) : undefined}
            />
          </Container>
        </Box>

        <TypeDefinitionContainer inSlide={inSlide}>
          <Stack spacing={6.5}>
            <DataTypesParents
              dataTypeBaseUrl={dataType.metadata.recordId.baseUrl}
              isReadOnly
              onDataTypeClick={(dataTypeId) => {
                pushToSlideStack({
                  kind: "dataType",
                  itemId: dataTypeId,
                });
              }}
            />

            <InheritedConstraintsProvider>
              <DataTypeConstraints isReadOnly />
              <DataTypeLabels isReadOnly />
              {!abstract && (
                <DataTypeConversions dataType={dataType.schema} isReadOnly />
              )}
            </InheritedConstraintsProvider>
          </Stack>
        </TypeDefinitionContainer>
      </FormProvider>

      {showEditDrawer && (
        <DataTypeEditorDrawer
          mode="edit"
          dataType={latestDataType ?? dataType}
          onClose={() => setShowEditDrawer(false)}
          onUpdated={(updatedDataType) => {
            setShowEditDrawer(false);
            void refetchRemoteType();
            onDataTypeUpdated(updatedDataType);
          }}
        />
      )}

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
