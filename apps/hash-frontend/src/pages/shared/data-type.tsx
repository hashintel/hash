import { useMutation, useQuery } from "@apollo/client";
import type { DataTypeWithMetadata as BpDataTypeWithMetadata } from "@blockprotocol/graph";
import { extractVersion } from "@blockprotocol/type-system";
import type {
  BaseUrl,
  DataTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { DataTypeRootType } from "@local/hash-subgraph/types";
import type { Theme } from "@mui/material";
import { Box, Container, Typography } from "@mui/material";
import { GlobalStyles, Stack } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

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
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import {
  type DataTypeFormData,
  getDataTypeFromFormData,
  getFormDataFromDataType,
} from "./data-type/data-type-form";
import { DataTypeHeader } from "./data-type/data-type-header";
import { DataTypesParents } from "./data-type/data-type-parents";
import { useDataTypesContext } from "./data-types-context";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import {
  TypeDefinitionContainer,
  typeHeaderContainerStyles,
} from "./shared/type-editor-styling";
import { TopContextBar } from "./top-context-bar";

type DataTypeProps = {
  inSlide?: boolean;
  ownedById?: OwnedById | null;
  draftNewDataType?: BpDataTypeWithMetadata | null;
  dataTypeBaseUrl?: BaseUrl;
  requestedVersion: number | null;
};

export const DataType = ({
  inSlide,
  ownedById,
  draftNewDataType,
  dataTypeBaseUrl,
  requestedVersion,
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
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      abstract: false,
      constraints: { type: "string" },
    },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

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
    skip: !dataTypeBaseUrl,
  });

  const { remoteDataType, latestVersion } = useMemo<{
    remoteDataType: DataTypeWithMetadata | null;
    latestVersion: number | null;
  }>(() => {
    if (!remoteDataTypeData) {
      return { remoteDataType: null, latestVersion: null };
    }

    const dataTypes = getRoots<DataTypeRootType>(
      mapGqlSubgraphFieldsFragmentToSubgraph(remoteDataTypeData.queryDataTypes),
    );

    let highestVersion = 0;
    let matchedDataType: DataTypeWithMetadata | null = null;
    for (const dataType of dataTypes) {
      const version = extractVersion(dataType.schema.$id);
      if (version > highestVersion) {
        highestVersion = version;
      }
      if (version === requestedVersion) {
        matchedDataType = dataType;
      }
    }

    return {
      remoteDataType: matchedDataType,
      latestVersion: highestVersion,
    };
  }, [remoteDataTypeData, requestedVersion]);

  useEffect(() => {
    if (remoteDataType) {
      formMethods.reset(getFormDataFromDataType(remoteDataType.schema));
    }
  }, [remoteDataType, formMethods]);

  const dataType = remoteDataType ?? draftNewDataType;

  const isDirty = Object.keys(formMethods.formState.dirtyFields).length > 0;

  const isDraft = !!draftNewDataType;

  const { userPermissions } = useUserPermissionsOnDataType(
    dataType?.schema.$id,
  );

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

  if (!userPermissions || !dataType) {
    return null;
  }

  const currentVersion = draftNewDataType
    ? 0
    : extractVersion(dataType.schema.$id);

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadOnly = !draftNewDataType && (!userPermissions.edit || !isLatest);

  return (
    <>
      <NextSeo title={`${dataType.schema.title} | Data Type`} />
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
                href: "#",
                id: dataType.schema.$id,
              },
            ]}
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
              key={dataType.schema.$id} // reset edit bar state when the data type changes
            />
          )}

          <Box sx={typeHeaderContainerStyles}>
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

          <TypeDefinitionContainer>
            <Stack spacing={6.5}>
              <Box>
                <Typography variant="h5" mb={2}>
                  Extends
                </Typography>
                <DataTypesParents isReadOnly={isReadOnly} />
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
