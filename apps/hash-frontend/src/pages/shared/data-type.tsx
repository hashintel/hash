import { useQuery } from "@apollo/client";
import type { DataTypeWithMetadata as BpDataTypeWithMetadata } from "@blockprotocol/graph";
import { extractVersion } from "@blockprotocol/type-system";
import type { AccountId } from "@local/hash-graph-types/account";
import type {
  BaseUrl,
  DataTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { DataTypeRootType } from "@local/hash-subgraph/types";
import type { Theme } from "@mui/material";
import { Box, Container } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { isTypeArchived } from "../../shared/is-archived";
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import { ArchiveMenuItem } from "../@/[shortname]/shared/archive-menu-item";
import {
  type DataTypeFormData,
  getDataTypeFromFormData,
  getFormDataFromDataType,
} from "./data-type/data-type-form";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import { TopContextBar } from "./top-context-bar";

type DataTypeProps = {
  accountId?: AccountId | null;
  draftNewDataType?: BpDataTypeWithMetadata | null;
  dataTypeBaseUrl?: BaseUrl;
  requestedVersion: number | null;
};

export const DataType = ({
  accountId,
  draftNewDataType,
  dataTypeBaseUrl,
  requestedVersion,
}: DataTypeProps) => {
  const router = useRouter();

  const formMethods = useForm<DataTypeFormData>({
    defaultValues: {
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      abstract: false,
      constraints: { type: "string" },
    },
  });
  const { handleSubmit: wrapHandleSubmit, reset, watch } = formMethods;

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
      includeArchived: true,
      filter: {
        equal: [{ path: ["baseUrl"] }, { parameter: dataTypeBaseUrl }],
      },
      inheritsFrom: { outgoing: 255 },
      latestOnly: false,
    },
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

  const handleSubmit = wrapHandleSubmit((data) => {
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

    const _dataType = getDataTypeFromFormData(data);
  });

  if (!userPermissions || !dataType) {
    return null;
  }

  const currentVersion = draftNewDataType
    ? 0
    : extractVersion(dataType.schema.$id);

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadonly = !draftNewDataType && (!userPermissions.edit || !isLatest);

  return (
    <>
      <NextSeo title={`${dataType.schema.title} | Data Type`} />
      <FormProvider {...formMethods}>
        <Box display="contents" component="form" onSubmit={handleSubmit}>
          <TopContextBar
            actionMenuItems={[
              ...(remoteDataType && !isTypeArchived(remoteDataType)
                ? [
                    <ArchiveMenuItem
                      key={dataType.schema.$id}
                      item={remoteDataType}
                    />,
                  ]
                : []),
            ]}
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
                href: "#",
                id: dataType.schema.$id,
              },
            ]}
            scrollToTop={() => {}}
            sx={{ bgcolor: "white" }}
          />

          {!isReadonly && (
            <EditBarTypeEditor
              currentVersion={currentVersion}
              discardButtonProps={
                // @todo confirmation of discard when draft
                isDraft
                  ? {
                      href: `/new/types/entity-type`,
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

          <Box
            sx={{
              borderBottom: 1,
              borderColor: "gray.20",
              pt: 3.75,
              backgroundColor: "white",
            }}
          >
            <Container>{/* TODO: HEADER */}</Container>
          </Box>

          <Box py={5}>
            <Container>{/* @TODO: data type details */}</Container>
          </Box>
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
