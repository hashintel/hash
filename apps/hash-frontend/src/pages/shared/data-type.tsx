import { useMutation, useQuery } from "@apollo/client";
import type { DataTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  OntologyTypeVersion,
  WebId,
} from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  extractVersion,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import type { Theme } from "@mui/material";
import { Box, Container, Stack } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import type {
  CreateDataTypeMutation,
  CreateDataTypeMutationVariables,
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
  UpdateDataTypeMutation,
  UpdateDataTypeMutationVariables,
} from "../../graphql/api-types.gen";
import {
  createDataTypeMutation,
  queryDataTypeSubgraphQuery,
  updateDataTypeMutation,
} from "../../graphql/queries/ontology/data-type.queries";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { Link } from "../../shared/ui/link";
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import { DataTypeConstraints } from "./data-type/data-type-constraints";
import { DataTypeConversions } from "./data-type/data-type-conversions";
import {
  type DataTypeFormData,
  getDataTypeFromFormData,
  getFormDataFromDataType,
} from "./data-type/data-type-form";
import { DataTypeHeader } from "./data-type/data-type-header";
import { DataTypeLabels } from "./data-type/data-type-labels";
import { DataTypesParents } from "./data-type/data-type-parents";
import { InheritedConstraintsProvider } from "./data-type/shared/use-inherited-constraints";
import { useDataTypesContext } from "./data-types-context";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import { NotFound } from "./not-found";
import { inSlideContainerStyles } from "./shared/slide-styles";
import { TypeEditorSkeleton } from "./shared/type-editor-skeleton";
import {
  TypeDefinitionContainer,
  typeHeaderContainerStyles,
} from "./shared/type-editor-styling";
import { useSlideStack } from "./slide-stack";
import { TopContextBar } from "./top-context-bar";

type DataTypeProps = {
  isInSlide?: boolean;
  webId?: WebId | null;
  draftNewDataType?: DataTypeWithMetadata | null;
  dataTypeBaseUrl?: BaseUrl;
  requestedVersion: OntologyTypeVersion | null;
  onDataTypeUpdated: (dataType: DataTypeWithMetadata) => void;
};

export const DataType = ({
  isInSlide: inSlide,
  webId,
  draftNewDataType,
  dataTypeBaseUrl,
  requestedVersion,
  onDataTypeUpdated,
}: DataTypeProps) => {
  const router = useRouter();

  const { refetch: refetchAllDataTypes } = useDataTypesContext();

  const [createDataType] = useMutation<
    CreateDataTypeMutation,
    CreateDataTypeMutationVariables
  >(createDataTypeMutation, {
    onCompleted() {
      refetchAllDataTypes();
    },
  });

  const [updateDataType] = useMutation<
    UpdateDataTypeMutation,
    UpdateDataTypeMutationVariables
  >(updateDataTypeMutation, {
    onCompleted(data) {
      refetchAllDataTypes();
      onDataTypeUpdated(data.updateDataType);
    },
  });

  const formMethods = useForm<DataTypeFormData>({
    defaultValues: {
      allOf: [],
      abstract: false,
      constraints: {},
      label: {},
      title: "",
    },
  });

  const {
    control,
    formState,
    handleSubmit: wrapHandleSubmit,
    reset,
  } = formMethods;

  const parents = useWatch({
    control,
    name: "allOf",
    defaultValue: [],
  });

  const abstract = useWatch({
    control,
    name: "abstract",
  });

  useEffect(() => {
    if (draftNewDataType) {
      reset(
        getFormDataFromDataType({
          schema: draftNewDataType.schema,
          metadata: { conversions: {} },
        }),
      );
    }
  }, [draftNewDataType, reset]);

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
      skip: !!draftNewDataType,
      fetchPolicy: "cache-and-network",
    },
  );

  const { remoteDataType, latestVersionNumber: latestVersion } = useMemo<{
    remoteDataType: DataTypeWithMetadata | null;
    latestVersionNumber: OntologyTypeVersion | null;
  }>(() => {
    if (!remoteDataTypeData || !!draftNewDataType) {
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
      return {
        remoteDataType: null,
        latestVersionNumber: null,
      };
    }

    if (!requestedVersion || !matchedDataType) {
      return {
        remoteDataType: null,
        latestVersionNumber: highestVersionDataType.metadata.recordId.version,
      };
    }

    return {
      remoteDataType: matchedDataType,
      latestVersionNumber: highestVersionDataType.metadata.recordId.version,
    };
  }, [remoteDataTypeData, requestedVersion, draftNewDataType]);

  useEffect(() => {
    if (remoteDataType) {
      formMethods.reset(getFormDataFromDataType(remoteDataType));
    }
  }, [remoteDataType, formMethods]);

  const dataType = remoteDataType ?? draftNewDataType;

  const isDirty = Object.keys(formMethods.formState.dirtyFields).length > 0;

  const isDraft = !!draftNewDataType;

  const { userPermissions, loading: loadingUserPermissions } =
    useUserPermissionsOnDataType(dataType?.schema.$id);

  const handleSubmit = wrapHandleSubmit(async (data) => {
    if (!isDirty && !isDraft) {
      /**
       * Prevent publishing a type unless:
       * 1. The form has been touched by the user (isDirty) – don't publish versions without changes
       * OR
       * 2. It's a new draft type – the user may not have touched the form from its initial state,
       *    which is set from input the user supplies in a separate form/modal.
       */
      return;
    }

    const { dataType: inputDataType, conversions } =
      getDataTypeFromFormData(data);

    if (isDraft) {
      if (!webId) {
        throw new Error("Cannot publish draft without webId");
      }

      const response = await createDataType({
        variables: {
          dataType: inputDataType,
          conversions,
          webId,
        },
      });

      if (!!response.errors?.length || !response.data) {
        throw new Error("Could not publish new data type");
      }

      void router.push(response.data.createDataType.schema.$id);
      return;
    }

    if (!remoteDataType?.schema.$id) {
      throw new Error("Cannot update data type without existing data type");
    }

    const response = await updateDataType({
      variables: {
        dataTypeId: remoteDataType.schema.$id,
        dataType: inputDataType,
        conversions,
      },
    });

    if (!!response.errors?.length || !response.data) {
      throw new Error("Could not update data type");
    }
  });

  const { pushToSlideStack } = useSlideStack();

  if (
    !draftNewDataType &&
    !dataType &&
    !loadingRemoteDataType &&
    !loadingUserPermissions
  ) {
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

  const currentVersion = draftNewDataType
    ? makeOntologyTypeVersion({ major: 0 })
    : extractVersion(dataType.schema.$id);

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadOnly = !draftNewDataType && (!userPermissions.edit || !isLatest);

  return (
    <>
      {!inSlide && <NextSeo title={`${dataType.schema.title} | Data Type`} />}
      <FormProvider {...formMethods}>
        <Box display="contents" component="form" onSubmit={handleSubmit}>
          <TopContextBar
            defaultCrumbIcon={null}
            item={remoteDataType ?? undefined}
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

          {!isReadOnly && (
            <EditBarTypeEditor
              currentVersion={currentVersion}
              discardButtonProps={
                // @todo confirmation of discard when draft
                isDraft
                  ? {
                      href: `/new/types/data-type`,
                    }
                  : {
                      onClick() {
                        reset();
                      },
                    }
              }
              errorMessage={
                parents.length === 0
                  ? "must extend another data type"
                  : Object.keys(formState.errors).length > 0
                    ? "see validation errors below"
                    : undefined
              }
              key={dataType.schema.$id} // reset edit bar state when the data type changes
              gentleErrorStyling={parents.length === 0}
            />
          )}

          <Box sx={typeHeaderContainerStyles}>
            <Container sx={inSlide ? inSlideContainerStyles : {}}>
              <DataTypeHeader
                currentVersion={currentVersion}
                dataTypeSchema={dataType.schema}
                isDraft={isDraft}
                isReadOnly={isReadOnly}
                isInSlide={inSlide}
                latestVersion={latestVersion}
              />
            </Container>
          </Box>

          <TypeDefinitionContainer inSlide={inSlide}>
            <Stack spacing={6.5}>
              <DataTypesParents
                dataTypeBaseUrl={dataType.metadata.recordId.baseUrl}
                isReadOnly={isReadOnly}
                onDataTypeClick={(dataTypeId) => {
                  pushToSlideStack({
                    kind: "dataType",
                    itemId: dataTypeId,
                  });
                }}
              />

              <InheritedConstraintsProvider>
                <DataTypeConstraints isReadOnly={isReadOnly} />
                <DataTypeLabels isReadOnly={isReadOnly} />
                {!abstract && (
                  <DataTypeConversions
                    dataType={dataType.schema}
                    isReadOnly={isReadOnly}
                  />
                )}
              </InheritedConstraintsProvider>
            </Stack>
          </TypeDefinitionContainer>
        </Box>
      </FormProvider>

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
