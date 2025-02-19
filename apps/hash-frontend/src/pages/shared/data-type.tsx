import { useMutation, useQuery } from "@apollo/client";
import type { DataTypeWithMetadata as BpDataTypeWithMetadata } from "@blockprotocol/graph";
import { extractVersion, type VersionedUrl } from "@blockprotocol/type-system";
import type {
  BaseUrl,
  DataTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";
import type { DataTypeRootType } from "@local/hash-subgraph/types";
import type { Theme } from "@mui/material";
import { Box, Container, Typography } from "@mui/material";
import { GlobalStyles, Stack } from "@mui/system";
import { isPrerenderInterruptedError } from "next/dist/server/app-render/dynamic-rendering";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import type {
  CreateDataTypeMutation,
  CreateDataTypeMutationVariables,
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
  UpdateDataTypeMutation,
  UpdateDataTypeMutationVariables,
} from "../../graphql/api-types.gen";
import {
  createDataTypeMutation,
  queryDataTypesQuery,
  updateDataTypeMutation,
} from "../../graphql/queries/ontology/data-type.queries";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { Link } from "../../shared/ui/link";
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import { DataTypeConstraints } from "./data-type/data-type-constraints";
import {
  type DataTypeFormData,
  getDataTypeFromFormData,
  getFormDataFromDataType,
} from "./data-type/data-type-form";
import { DataTypeHeader } from "./data-type/data-type-header";
import { DataTypesParents } from "./data-type/data-type-parents";
import { useDataTypesContext } from "./data-types-context";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import { NotFound } from "./not-found";
import {
  TypeDefinitionContainer,
  typeHeaderContainerStyles,
} from "./shared/type-editor-styling";
import { TopContextBar } from "./top-context-bar";

type DataTypeProps = {
  inSlide?: boolean;
  isReadOnly: boolean;
  ownedById?: OwnedById | null;
  draftNewDataType?: BpDataTypeWithMetadata | null;
  dataTypeBaseUrl?: BaseUrl;
  onDataTypeClick: (dataTypeId: VersionedUrl) => void;
  requestedVersion: number | null;
};

export const DataType = ({
  inSlide,
  isReadOnly: readonlyFromProps,
  ownedById,
  draftNewDataType,
  dataTypeBaseUrl,
  requestedVersion,
  onDataTypeClick,
}: DataTypeProps) => {
  const router = useRouter();

  const { refetch } = useDataTypesContext();

  const [createDataType] = useMutation<
    CreateDataTypeMutation,
    CreateDataTypeMutationVariables
  >(createDataTypeMutation, {
    onCompleted() {
      refetch();
    },
  });

  const [updateDataType] = useMutation<
    UpdateDataTypeMutation,
    UpdateDataTypeMutationVariables
  >(updateDataTypeMutation, {
    onCompleted() {
      refetch();
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

  useEffect(() => {
    if (draftNewDataType) {
      reset(getFormDataFromDataType(draftNewDataType.schema));
    }
  }, [draftNewDataType, reset]);

  const { loading: loadingRemoteDataType, data: remoteDataTypeData } = useQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    variables: {
      constrainsValuesOn: { outgoing: 255 },
      filter: {
        equal: [{ path: ["baseUrl"] }, { parameter: dataTypeBaseUrl }],
      },
      includeArchived: true,
      inheritsFrom: { outgoing: 255 },
      latestOnly: false,
    },
    skip: !!draftNewDataType,
    fetchPolicy: "cache-and-network",
  });

  const { remoteDataType, latestVersionNumber: latestVersion } = useMemo<{
    remoteDataType: DataTypeWithMetadata | null;
    latestVersionNumber: number | null;
  }>(() => {
    if (!remoteDataTypeData || !!draftNewDataType) {
      return { remoteDataType: null, latestVersionNumber: null };
    }

    const dataTypes = getRoots<DataTypeRootType>(
      mapGqlSubgraphFieldsFragmentToSubgraph(remoteDataTypeData.queryDataTypes),
    );

    let highestVersionDataType: DataTypeWithMetadata | null = null;
    let matchedDataType: DataTypeWithMetadata | null = null;
    for (const dataType of dataTypes) {
      const version = extractVersion(dataType.schema.$id);
      if (
        !highestVersionDataType ||
        version > highestVersionDataType.metadata.recordId.version
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
      formMethods.reset(getFormDataFromDataType(remoteDataType.schema));
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

    const inputData = getDataTypeFromFormData(data);

    if (isDraft) {
      if (!ownedById) {
        throw new Error("Cannot publish draft without ownedById");
      }

      const response = await createDataType({
        variables: {
          dataType: inputData,
          ownedById,
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
        dataType: inputData,
      },
    });

    if (!!response.errors?.length || !response.data) {
      throw new Error("Could not update data type");
    }

    void router.push(response.data.updateDataType.schema.$id);
  });

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
    return null;
  }

  if (!dataType || !userPermissions) {
    throw new Error("Cannot render data type without data type");
  }

  const currentVersion = draftNewDataType
    ? 0
    : extractVersion(dataType.schema.$id);

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadOnly =
    readonlyFromProps ||
    (!draftNewDataType && (!userPermissions.edit || !isLatest));

  return (
    <>
      <NextSeo title={`${dataType.schema.title} | Data Type`} />
      <FormProvider {...formMethods}>
        <Box display="contents" component="form" onSubmit={handleSubmit}>
          {!inSlide && (
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
                  href: "#",
                  id: dataType.schema.$id,
                },
              ]}
              scrollToTop={() => {}}
              sx={{ bgcolor: "white" }}
            />
          )}

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
            />
          )}

          <Box
            sx={[
              typeHeaderContainerStyles,
              inSlide ? { border: "none", pb: 0 } : {},
            ]}
          >
            <Container>
              <DataTypeHeader
                currentVersion={currentVersion}
                dataTypeSchema={dataType.schema}
                hideOpenInNew={!inSlide}
                isDraft={isDraft}
                isReadOnly={isReadOnly}
                isPreviewSlide={inSlide}
                latestVersion={latestVersion}
              />
            </Container>
          </Box>

          <TypeDefinitionContainer inSlide={inSlide}>
            <Stack spacing={6.5}>
              <Box>
                <Typography variant="h5" mb={2}>
                  Extends
                </Typography>
                <DataTypesParents
                  isReadOnly={isReadOnly}
                  onDataTypeClick={onDataTypeClick}
                />
              </Box>
              <Box>
                <Typography variant="h5" mb={2}>
                  Constraints
                </Typography>
                <DataTypeConstraints isReadOnly={isReadOnly} />
              </Box>
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
