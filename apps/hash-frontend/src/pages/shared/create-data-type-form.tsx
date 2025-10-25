import { useLazyQuery } from "@apollo/client";
import type { DataType, VersionedUrl } from "@blockprotocol/type-system";
import {
  DATA_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { Callout, TextField } from "@hashintel/design-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { Box, Stack } from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useContext } from "react";
import { useForm } from "react-hook-form";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { Button } from "../../shared/ui/button";
import { useAuthenticatedUser } from "./auth-info-context";
import { useDataTypesContext } from "./data-types-context";
import { useSlideStack } from "./slide-stack";
import { useGenerateTypeUrlsForUser } from "./use-generate-type-urls-for-user";
import { WorkspaceContext } from "./workspace-context";

const HELPER_TEXT_WIDTH = 290;

type CreateDataTypeFormData = {
  extendsDataTypeId?: VersionedUrl;
  title: string;
  description: string;
};

type CreateDataTypeFormProps = {
  afterSubmit?: () => void;
  initialData: Partial<CreateDataTypeFormData>;
  inModal?: boolean;
  onCancel: () => void;
};

const extractNamespaceFromVersionedUrl = (versionedUrl: VersionedUrl) => {
  return new URL(versionedUrl).pathname.split("/")[1]!.replace(/@/, "");
};

export const CreateDataTypeForm = ({
  afterSubmit,
  initialData,
  inModal,
  onCancel,
}: CreateDataTypeFormProps) => {
  const router = useRouter();

  const [queryDataTypes] = useLazyQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery);

  const {
    handleSubmit,
    register,
    formState: {
      isSubmitting,
      errors: { title: titleError },
    },
    clearErrors,
  } = useForm<CreateDataTypeFormData>({
    shouldFocusError: true,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: initialData,
  });

  const { activeWorkspace } = useContext(WorkspaceContext);
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();

  const { authenticatedUser } = useAuthenticatedUser();

  const { extendsDataTypeId } = initialData;

  const { dataTypes } = useDataTypesContext();

  const { closeSlideStack } = useSlideStack();

  const parentType = extendsDataTypeId ? dataTypes?.[extendsDataTypeId] : null;

  if (!activeWorkspace) {
    return null;
  }

  if (
    extendsDataTypeId &&
    dataTypes &&
    Object.keys(dataTypes).length &&
    !parentType
  ) {
    throw new Error(
      `Could not find parent data type ${extendsDataTypeId} in data type options`,
    );
  }

  const handleFormSubmit = handleSubmit(async (data) => {
    const { extendsDataTypeId: parentId } = data;

    const { baseUrl, versionedUrl } = generateTypeUrlsForUser({
      title: data.title,
      kind: "data-type",
      version: makeOntologyTypeVersion({ major: 1 }),
    });

    const primitiveType =
      parentType?.schema && "type" in parentType.schema
        ? /** not sure what is going on with tsc inference here, something about the disjoint union of type: x options it complains about */
          (parentType.schema.type as "boolean")
        : ("string" as "boolean");

    const dataType: DataType = {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      $id: versionedUrl,
      abstract: false,
      allOf: parentId ? [{ $ref: parentId }] : undefined,
      title: data.title,
      description: data.description,
      type: primitiveType,
    };

    const nextUrl = `${baseUrl}?draft=${encodeURIComponent(
      Buffer.from(JSON.stringify(dataType)).toString("base64"),
    )}`;

    afterSubmit?.();

    await router.push(nextUrl);
    closeSlideStack();
  });

  const formItemWidth = `min(calc(100% - ${HELPER_TEXT_WIDTH + 52}px), 600px)`;

  const parentWebName = parentType
    ? extractNamespaceFromVersionedUrl(parentType.schema.$id)
    : undefined;

  const crossWebAction =
    parentType && parentWebName !== activeWorkspace.shortname;

  const potentiallyUndesiredCrossWebAction =
    crossWebAction &&
    authenticatedUser.memberOf.find(
      ({ org }) =>
        org.shortname === parentWebName ||
        org.shortname === activeWorkspace.shortname,
    );

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        // stop submission propagating in case this form is nested in another
        event.stopPropagation();

        void handleFormSubmit(event);
      }}
      data-testid="data-type-creation-form"
    >
      <Stack
        alignItems="stretch"
        sx={(theme) => ({
          ...(inModal
            ? {}
            : {
                [theme.breakpoints.up("md")]: {
                  width: formItemWidth,
                },
              }),
        })}
        spacing={3}
      >
        {parentType && (
          <Callout
            type={potentiallyUndesiredCrossWebAction ? "warning" : "info"}
            sx={{ width: { md: inModal ? "100%" : formItemWidth } }}
          >
            You are extending the <strong>{parentType.schema.title}</strong>{" "}
            data type from <strong>@{parentWebName}</strong>
            {" to create a new data type within "}
            {crossWebAction ? (
              <strong>@{activeWorkspace.shortname}</strong>
            ) : (
              "the same web"
            )}
            .
          </Callout>
        )}
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ px: inModal ? 3 : 0, width: "100%" }}
        >
          <TextField
            {...register("title", {
              required: true,
              onChange() {
                clearErrors("title");
              },
              async validate(titleToValidate) {
                const res = await queryDataTypes({
                  variables: {
                    request: {
                      filter: {
                        equal: [
                          {
                            path: ["versionedUrl"],
                          },
                          {
                            parameter: generateTypeUrlsForUser({
                              kind: "data-type",
                              title: titleToValidate,
                              version: makeOntologyTypeVersion({ major: 1 }),
                            }).versionedUrl,
                          },
                        ],
                      },
                      temporalAxes: currentTimeInstantTemporalAxes,
                    },
                  },
                });

                return res.data?.queryDataTypes.dataTypes.length
                  ? "Data type name must be unique"
                  : true;
              },
            })}
            autoFocus
            required
            label="Name"
            type="text"
            placeholder="e.g. Email"
            tooltipText="Provide the singular form of your data type’s name so it can be referred to correctly (e.g. “Email” not “Emails”)"
            error={!!titleError}
            errorText={titleError?.message}
            sx={{ width: "50%" }}
          />
        </Stack>
        <TextField
          {...register("description", {
            required: true,
          })}
          required
          multiline
          onKeyDown={async (evt) => {
            if (!isSubmitting && evt.key === "Enter" && evt.metaKey) {
              await handleFormSubmit(evt);
            }
          }}
          inputProps={{ minRows: 1 }}
          label="Description"
          type="text"
          placeholder="Describe this data type in one or two sentences"
          tooltipText="Descriptions should explain what a data type is and its intended use"
          sx={{ px: inModal ? 3 : 0 }}
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          px={inModal ? 3 : 0}
          pb={inModal ? 3 : 0}
          mt={3}
        >
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || !!titleError}
            loadingWithoutText
          >
            Create new data type
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            variant="tertiary"
            size="small"
            disabled={isSubmitting}
          >
            Discard
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};
