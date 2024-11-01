import { useLazyQuery } from "@apollo/client";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system/slim";
import { Callout, TextField } from "@hashintel/design-system";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import type { SxProps, Theme } from "@mui/material";
import {
  Box,
  formHelperTextClasses,
  outlinedInputClasses,
  Stack,
} from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useCallback, useContext } from "react";
import { useForm } from "react-hook-form";

import { useBlockProtocolGetEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import type {
  GenerateInverseQuery,
  GenerateInverseQueryVariables,
  GeneratePluralQuery,
  GeneratePluralQueryVariables,
} from "../../graphql/api-types.gen";
import {
  generateInverseQuery,
  generatePluralQuery,
} from "../../graphql/queries/generation.queries";
import { useEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { Button } from "../../shared/ui/button";
import { useAuthenticatedUser } from "./auth-info-context";
import { useGenerateTypeUrlsForUser } from "./use-generate-type-urls-for-user";
import { WorkspaceContext } from "./workspace-context";

const HELPER_TEXT_WIDTH = 290;

const FormHelperLabel = ({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) => (
  <Box
    component="span"
    color={(theme) => theme.palette.blue[70]}
    display="inline"
    fontWeight="bold"
    sx={sx}
  >
    {children}
  </Box>
);

type CreateEntityTypeFormData = {
  extendsEntityTypeId?: VersionedUrl;
  title: string;
  titlePlural: string;
  inverseTitle?: string;
  inverseTitlePlural?: string;
  description: string;
};

type CreateEntityTypeFormProps = {
  afterSubmit?: () => void;
  initialData: Partial<CreateEntityTypeFormData>;
  inModal?: boolean;
  isLink: boolean;
  onCancel: () => void;
};

const extractNamespaceFromVersionedUrl = (versionedUrl: VersionedUrl) => {
  return new URL(versionedUrl).pathname.split("/")[1]!.replace(/@/, "");
};

export const CreateEntityTypeForm = ({
  afterSubmit,
  initialData,
  inModal,
  isLink,
  onCancel,
}: CreateEntityTypeFormProps) => {
  const router = useRouter();

  const {
    handleSubmit,
    register,
    formState: {
      isSubmitting,
      errors: { title: titleError },
    },
    clearErrors,
    setValue,
    watch,
  } = useForm<CreateEntityTypeFormData>({
    shouldFocusError: true,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: initialData,
  });

  const titlePlural = watch("titlePlural");
  const inverseTitle = watch("inverseTitle");
  const inverseTitlePlural = watch("inverseTitlePlural");

  const [generatePlural] = useLazyQuery<
    GeneratePluralQuery,
    GeneratePluralQueryVariables
  >(generatePluralQuery);

  const [generateInverse] = useLazyQuery<
    GenerateInverseQuery,
    GenerateInverseQueryVariables
  >(generateInverseQuery);

  const updateTitlePlural = useCallback(
    async (title: string, inverse: boolean) => {
      if (
        !title
        // (inverse && inverseTitlePlural) ||
        // (!inverse && titlePlural)
      ) {
        return;
      }

      const { data } = await generatePlural({
        variables: {
          singular: title,
        },
      });

      if (!data) {
        throw new Error(`No data returned from generatePlural query`);
      }

      const plural = data.generatePlural;

      if (
        (inverse && plural === inverseTitlePlural) ||
        (!inverse && plural === titlePlural)
      ) {
        return;
      }

      setValue(inverse ? "inverseTitlePlural" : "titlePlural", plural);
    },
    [generatePlural, inverseTitlePlural, setValue, titlePlural],
  );

  const updateInverse = useCallback(
    async (linkTitle: string) => {
      if (!linkTitle) {
        return;
      }

      const { data } = await generateInverse({
        variables: {
          relationship: linkTitle,
        },
      });

      if (!data) {
        throw new Error(`No data returned from generateInverse query`);
      }

      const inverse = data.generateInverse;

      if (inverse === inverseTitle) {
        return;
      }

      setValue("inverseTitle", inverse);

      await updateTitlePlural(inverse, true);
    },
    [generateInverse, inverseTitle, setValue, updateTitlePlural],
  );

  const { getEntityType } = useBlockProtocolGetEntityType();
  const { activeWorkspace } = useContext(WorkspaceContext);
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();

  const { authenticatedUser } = useAuthenticatedUser();

  const { extendsEntityTypeId } = initialData;

  const entityTypes = useEntityTypesOptional();
  const parentType = extendsEntityTypeId
    ? entityTypes?.find(
        (entityType) => entityType.schema.$id === extendsEntityTypeId,
      )
    : null;

  if (!activeWorkspace) {
    return null;
  }

  if (extendsEntityTypeId && entityTypes?.length && !parentType) {
    throw new Error(
      `Could not find parent entity type ${extendsEntityTypeId} in entity type options`,
    );
  }

  const handleFormSubmit = handleSubmit(async (data) => {
    const { extendsEntityTypeId: parentId, title } = data;

    const { baseUrl, versionedUrl } = generateTypeUrlsForUser({
      title,
      kind: "entity-type",
      version: 1,
    });

    const entityType: EntityType = {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: versionedUrl,
      allOf: parentId ? [{ $ref: parentId }] : undefined,
      title,
      titlePlural: data.titlePlural,
      description: data.description,
      type: "object",
      properties: {},
    };

    if (isLink && "inverseTitle" in data) {
      entityType.inverse = {
        title: data.inverseTitle!,
        titlePlural: data.inverseTitlePlural!,
      };
    }

    const nextUrl = `${baseUrl}?draft=${encodeURIComponent(
      Buffer.from(JSON.stringify(entityType)).toString("base64"),
    )}`;

    afterSubmit?.();

    await router.push(nextUrl);
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
      data-testid="entity-type-creation-form"
    >
      <Stack
        alignItems="stretch"
        sx={(theme) => ({
          ...(inModal
            ? {}
            : {
                [theme.breakpoints.up("md")]: {
                  [`.${outlinedInputClasses.root}`]: {
                    width: formItemWidth,
                  },

                  [`.${formHelperTextClasses.root}`]: {
                    position: "absolute",
                    left: `calc(${formItemWidth} + 30px)`,
                    top: 24,
                    width: HELPER_TEXT_WIDTH,
                    p: 0,
                    m: 0,
                    color: theme.palette.gray[80],
                  },
                },

                [`.${formHelperTextClasses.root}`]: {
                  [`&:not(.${formHelperTextClasses.focused}):not(.${formHelperTextClasses.error})`]:
                    {
                      display: "none",
                    },
                },
              }),
        })}
        spacing={3}
      >
        {parentType && parentType.schema.$id !== linkEntityTypeUrl && (
          <Callout
            type={potentiallyUndesiredCrossWebAction ? "warning" : "info"}
            sx={{ width: { md: inModal ? "100%" : formItemWidth } }}
          >
            You are extending the <strong>{parentType.schema.title}</strong>{" "}
            entity type from <strong>@{parentWebName}</strong>
            {" to create a new entity type within "}
            {crossWebAction ? (
              <strong>@{activeWorkspace.shortname}</strong>
            ) : (
              "the same web"
            )}
            .
          </Callout>
        )}
        <TextField
          {...register("title", {
            required: true,
            onChange() {
              clearErrors("title");
            },
            onBlur(event) {
              void updateTitlePlural(event.target.value, false);

              if (isLink) {
                void updateInverse(event.target.value);
              }
            },
            async validate(title) {
              const res = await getEntityType({
                data: {
                  entityTypeId: generateTypeUrlsForUser({
                    kind: "entity-type",
                    title,
                    version: 1,
                  }).versionedUrl,
                  graphResolveDepths: {
                    constrainsValuesOn: { outgoing: 0 },
                    constrainsPropertiesOn: { outgoing: 0 },
                    constrainsLinksOn: { outgoing: 0 },
                    constrainsLinkDestinationsOn: { outgoing: 0 },
                  },
                },
              });

              return res.data?.roots.length
                ? "Entity type name must be unique"
                : true;
            },
          })}
          autoFocus
          required
          label="Singular name"
          type="text"
          placeholder={isLink ? "e.g. Is Parent Of" : "e.g. Stock Price"}
          helperText={
            titleError?.message ? (
              <>
                <FormHelperLabel
                  sx={(theme) => ({ color: theme.palette.red[70] })}
                >
                  Error
                </FormHelperLabel>{" "}
                - {titleError.message}
              </>
            ) : inModal ? undefined : (
              <>
                <FormHelperLabel>Required</FormHelperLabel> - provide the
                singular form of your entity type’s name so it can be referred
                to correctly (e.g. “Stock Price” not “Stock Prices”)
              </>
            )
          }
          error={!!titleError}
          sx={{ px: inModal ? 3 : 0 }}
        />
        <TextField
          {...register("titlePlural", {
            required: true,
            onChange() {
              clearErrors("titlePlural");
            },
          })}
          required
          label="Pluralized name"
          type="text"
          placeholder={isLink ? "Are Parents Of" : "e.g. Stock Prices"}
          helperText={
            inModal ? undefined : (
              <>
                <FormHelperLabel>Required</FormHelperLabel> - provide the
                pluralized form of your entity type’s name so it can be referred
                to correctly when multiple are present
              </>
            )
          }
          sx={{ px: inModal ? 3 : 0 }}
        />
        {isLink && (
          <>
            <TextField
              {...register("inverseTitle", {
                required: true,
                onBlur(event) {
                  void updateInverse(event.target.value);
                },
                onChange() {
                  clearErrors("inverseTitle");
                },
              })}
              required
              label="Singular inverse name"
              type="text"
              placeholder="e.g. Is Child Of"
              helperText={
                titleError?.message ? (
                  <>
                    <FormHelperLabel
                      sx={(theme) => ({ color: theme.palette.red[70] })}
                    >
                      Error
                    </FormHelperLabel>{" "}
                    - {titleError.message}
                  </>
                ) : inModal ? undefined : (
                  <>
                    <FormHelperLabel>Required</FormHelperLabel> - provide the
                    inverse name for the link so it can be used when describing
                    the link in the opposite direction
                  </>
                )
              }
              error={!!titleError}
              sx={{ px: inModal ? 3 : 0 }}
            />
            <TextField
              {...register("inverseTitlePlural", {
                required: true,
                onChange() {
                  clearErrors("inverseTitlePlural");
                },
              })}
              required
              label="Pluralized inverse name"
              type="text"
              placeholder="e.g. Are Children Of"
              helperText={
                inModal ? undefined : (
                  <>
                    <FormHelperLabel>Required</FormHelperLabel> - provide the
                    pluralized form of the inverse link so that it can be used
                    when describing a list of links in the opposite direction
                  </>
                )
              }
              sx={{ px: inModal ? 3 : 0 }}
            />
          </>
        )}
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
          placeholder="Describe this entity in one or two sentences"
          helperText={
            inModal ? undefined : (
              <Box pr={3.75}>
                <FormHelperLabel>Required</FormHelperLabel> - descriptions
                should explain what an entity type is, and when they should be
                used
              </Box>
            )
          }
          sx={{ px: inModal ? 3 : 0 }}
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          px={inModal ? 3 : 0}
          pb={inModal ? 3 : 0}
        >
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || !!titleError}
            loadingWithoutText
          >
            Create new entity type
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
