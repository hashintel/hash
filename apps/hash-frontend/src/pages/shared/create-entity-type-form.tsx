import { useLazyQuery, useQuery } from "@apollo/client";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import {
  ENTITY_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { Callout, TextField } from "@hashintel/design-system";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box, Stack } from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useCallback, useContext, useState } from "react";
import { useForm } from "react-hook-form";

import { useBlockProtocolGetEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import type {
  GenerateInverseQuery,
  GenerateInverseQueryVariables,
  GeneratePluralQuery,
  GeneratePluralQueryVariables,
  IsGenerationAvailableQuery,
} from "../../graphql/api-types.gen";
import {
  generateInverseQuery,
  generatePluralQuery,
  isGenerationAvailableQuery,
} from "../../graphql/queries/generation.queries";
import { useEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { Button } from "../../shared/ui/button";
import { useAuthenticatedUser } from "./auth-info-context";
import { useSlideStack } from "./slide-stack";
import { useGenerateTypeUrlsForUser } from "./use-generate-type-urls-for-user";
import { WorkspaceContext } from "./workspace-context";

const HELPER_TEXT_WIDTH = 290;

type CreateEntityTypeFormData = {
  extendsEntityTypeId?: VersionedUrl;
  title: string;
  titlePlural: string;
  inverseTitle?: string;
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

  const { closeSlideStack } = useSlideStack();

  const title = watch("title");
  const titlePlural = watch("titlePlural");
  const inverseTitle = watch("inverseTitle");

  const { data: isGenerationAvailableData } =
    useQuery<IsGenerationAvailableQuery>(isGenerationAvailableQuery, {
      fetchPolicy: "no-cache",
    });

  const generationAvailable =
    !!isGenerationAvailableData?.isGenerationAvailable.available;

  const [requestHasBeenMade, setRequestHasBeenMade] = useState(false);

  const [generatePlural, { loading: pluralLoading }] = useLazyQuery<
    GeneratePluralQuery,
    GeneratePluralQueryVariables
  >(generatePluralQuery, { fetchPolicy: "no-cache" });

  const [generateInverse, { loading: inverseLoading }] = useLazyQuery<
    GenerateInverseQuery,
    GenerateInverseQueryVariables
  >(generateInverseQuery, { fetchPolicy: "no-cache" });

  const updateTitlePlural = useCallback(
    async (newTitle: string) => {
      setRequestHasBeenMade(true);

      if (!newTitle || !generationAvailable) {
        return;
      }

      const { data } = await generatePlural({
        variables: {
          singular: newTitle,
        },
      });

      if (!data) {
        throw new Error(`No data returned from generatePlural query`);
      }

      const plural = data.generatePlural;

      if (plural === titlePlural) {
        return;
      }

      setValue("titlePlural", plural);
    },
    [generatePlural, generationAvailable, setValue, titlePlural],
  );

  const updateInverse = useCallback(
    async (linkTitle: string) => {
      if (!linkTitle || !generationAvailable) {
        return;
      }

      setRequestHasBeenMade(true);

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
    },
    [generateInverse, generationAvailable, inverseTitle, setValue],
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
    const { extendsEntityTypeId: parentId } = data;

    const { baseUrl, versionedUrl } = generateTypeUrlsForUser({
      title: data.title,
      kind: "entity-type",
      version: makeOntologyTypeVersion({ major: 1 }),
    });

    const entityType: EntityType = {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: versionedUrl,
      allOf: parentId ? [{ $ref: parentId }] : undefined,
      title: data.title,
      titlePlural: data.titlePlural,
      description: data.description,
      type: "object",
      properties: {},
    };

    if (isLink && "inverseTitle" in data) {
      entityType.inverse = {
        title: data.inverseTitle!,
      };
    }

    const nextUrl = `${baseUrl}?draft=${encodeURIComponent(
      Buffer.from(JSON.stringify(entityType)).toString("base64"),
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
      data-testid="entity-type-creation-form"
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
        {parentType &&
          parentType.schema.$id !==
            blockProtocolEntityTypes.link.entityTypeId && (
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
              onBlur(event) {
                if (!titlePlural) {
                  void updateTitlePlural(event.target.value);
                }

                if (isLink && !inverseTitle) {
                  void updateInverse(event.target.value);
                }
              },
              async validate(titleToValidate) {
                const res = await getEntityType({
                  data: {
                    entityTypeId: generateTypeUrlsForUser({
                      kind: "entity-type",
                      title: titleToValidate,
                      version: makeOntologyTypeVersion({ major: 1 }),
                    }).versionedUrl,
                    graphResolveDepths: zeroedGraphResolveDepths,
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
            tooltipText="Provide the singular form of your entity type’s name so it can be referred to correctly (e.g. “Stock Price” not “Stock Prices”)"
            error={!!titleError}
            errorText={titleError?.message}
            sx={{ width: "50%" }}
          />
          <TextField
            {...register("titlePlural", {
              required: true,
              onChange() {
                clearErrors("titlePlural");
              },
            })}
            disabled={
              !title ||
              pluralLoading ||
              (generationAvailable && !requestHasBeenMade)
            }
            loading={pluralLoading}
            required
            label="Pluralized name"
            type="text"
            placeholder={
              !title
                ? "Enter the singular name first"
                : pluralLoading
                  ? "Suggesting..."
                  : isLink
                    ? "Is Parent Ofs"
                    : "e.g. Stock Prices"
            }
            tooltipText="Provide the pluralized form of your entity type’s name so it can be referred to correctly when multiple are present"
            sx={{ width: "50%" }}
          />
        </Stack>
        {isLink && (
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
            disabled={
              !title ||
              inverseLoading ||
              (generationAvailable && !requestHasBeenMade)
            }
            required
            label="Inverse name"
            type="text"
            placeholder={
              !title
                ? "Enter the link name first"
                : inverseLoading
                  ? "Suggesting..."
                  : "e.g. Is Child Of"
            }
            tooltipText="Provide the inverse name for the link so it can be used when describing the link in the opposite direction"
            sx={{ px: inModal ? 3 : 0 }}
          />
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
          placeholder={`Describe this ${isLink ? "link" : "entity"} type in one or two sentences`}
          tooltipText="Descriptions should explain what an entity type is"
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
