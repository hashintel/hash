import {
  ENTITY_TYPE_META_SCHEMA,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, TextField } from "@hashintel/design-system";
import {
  Box,
  formHelperTextClasses,
  outlinedInputClasses,
  Stack,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";
// eslint-disable-next-line unicorn/prefer-node-protocol -- https://github.com/sindresorhus/eslint-plugin-unicorn/issues/1931#issuecomment-1359324528
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { ReactNode, useContext } from "react";
import { useForm } from "react-hook-form";

import { useBlockProtocolGetEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { useEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { Button } from "../../shared/ui/button";
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
  name: string;
  description: string;
};

type CreateEntityTypeFormProps = {
  afterSubmit?: () => void;
  initialData: Partial<CreateEntityTypeFormData>;
  inModal?: boolean;
  onCancel: () => void;
};

export const CreateEntityTypeForm = ({
  afterSubmit,
  initialData,
  inModal,
  onCancel,
}: CreateEntityTypeFormProps) => {
  const router = useRouter();

  const {
    handleSubmit,
    register,
    formState: {
      isSubmitting,
      errors: { name: nameError },
    },
    clearErrors,
  } = useForm<CreateEntityTypeFormData>({
    shouldFocusError: true,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: initialData,
  });

  const { getEntityType } = useBlockProtocolGetEntityType();
  const { activeWorkspace } = useContext(WorkspaceContext);
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();

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

  const handleFormSubmit = handleSubmit(
    async ({ extendsEntityTypeId: parentId, name, description }) => {
      const { baseUrl, versionedUrl } = generateTypeUrlsForUser({
        title: name,
        kind: "entity-type",
        version: 1,
      });
      const entityType: EntityType = {
        $schema: ENTITY_TYPE_META_SCHEMA,
        kind: "entityType",
        $id: versionedUrl,
        allOf: parentId ? [{ $ref: parentId }] : undefined,
        title: name,
        description,
        type: "object",
        properties: {},
      };

      const nextUrl = `${baseUrl}?draft=${encodeURIComponent(
        Buffer.from(JSON.stringify(entityType)).toString("base64"),
      )}`;

      afterSubmit?.();

      await router.push(nextUrl);
    },
  );

  const formItemWidth = `min(calc(100% - ${HELPER_TEXT_WIDTH + 52}px), 600px)`;

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
        {parentType && (
          <Stack
            alignItems="center"
            direction="row"
            sx={({ palette }) => ({
              background: palette.yellow[20],
              border: `1px solid ${palette.yellow[40]}`,
              px: 2.5,
              py: 2,
              width: { md: inModal ? "100%" : formItemWidth },
            })}
          >
            <FontAwesomeIcon
              icon={faWarning}
              sx={({ palette }) => ({
                color: palette.yellow[70],
                fontSize: 32,
                mr: 3,
              })}
            />
            <Typography
              variant="smallTextLabels"
              sx={({ palette }) => ({ color: palette.gray[80] })}
            >
              You are extending <strong>{parentType.schema.title}</strong> to
              create a new entity type in the
              <strong> @{activeWorkspace.shortname} </strong>
              workspace.
            </Typography>
          </Stack>
        )}
        <TextField
          {...register("name", {
            required: true,
            onChange() {
              clearErrors("name");
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
          required
          label="Singular Name"
          type="text"
          placeholder="e.g. Stock Price"
          helperText={
            nameError?.message ? (
              <>
                <FormHelperLabel
                  sx={(theme) => ({ color: theme.palette.red[70] })}
                >
                  Error
                </FormHelperLabel>{" "}
                - {nameError.message}
              </>
            ) : inModal ? undefined : (
              <>
                <FormHelperLabel>Required</FormHelperLabel> - provide the
                singular form of your entity type’s name so it can be referred
                to correctly (e.g. “Stock Price” not “Stock Prices”)
              </>
            )
          }
          error={!!nameError}
          sx={{ px: inModal ? 3 : 0 }}
        />
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
            disabled={isSubmitting || !!nameError}
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
