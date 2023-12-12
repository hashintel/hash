import { extractVersion } from "@blockprotocol/type-system";
import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  EntityTypeIcon,
  LinkTypeIcon,
  OntologyChip,
} from "@hashintel/design-system";
import {
  EntityTypeEditorFormData,
  EntityTypeFormProvider,
  getFormDataFromSchema,
  getSchemaFromFormData,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import { generateLinkMapWithConsistentSelfReferences } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
  BaseUrl,
  linkEntityTypeUrl,
  OwnedById,
} from "@local/hash-subgraph";
import { Box, Container, Theme, Typography } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo, useState } from "react";

import { PageErrorState } from "../../components/page-error-state";
import { EntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { useEntityTypeEntitiesContextValue } from "../../shared/entity-type-entities-context/use-entity-type-entities-context-value";
import { useIsSpecialEntityType } from "../../shared/entity-types-context/hooks";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { isTypeArchived } from "../../shared/is-archived";
import { isHrefExternal } from "../../shared/is-href-external";
import { ArchiveMenuItem } from "../[shortname]/shared/archive-menu-item";
import { ConvertTypeMenuItem } from "./entity-type-page/convert-type-menu-item";
import { DefinitionTab } from "./entity-type-page/definition-tab";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import { EntitiesTab } from "./entity-type-page/entities-tab";
import { EntityTypeTabs } from "./entity-type-page/entity-type-tabs";
import { FileUploadsTab } from "./entity-type-page/file-uploads-tab";
import { EntityTypeContext } from "./entity-type-page/shared/entity-type-context";
import { EntityTypeHeader } from "./entity-type-page/shared/entity-type-header";
import { useCurrentTab } from "./entity-type-page/shared/tabs";
import { TypePreviewSlide } from "./entity-type-page/type-preview-slide";
import { useEntityTypeValue } from "./entity-type-page/use-entity-type-value";
import { TopContextBar } from "./top-context-bar";

type EntityTypeProps = {
  accountId?: AccountId | null;
  draftEntityType?: EntityType | null;
  entityTypeBaseUrl?: BaseUrl;
  requestedVersion: number | null;
  readonly: boolean;
};

export const EntityTypePage = ({
  accountId,
  draftEntityType,
  entityTypeBaseUrl,
  requestedVersion,
  readonly,
}: EntityTypeProps) => {
  const router = useRouter();

  const entityTypeEntitiesValue = useEntityTypeEntitiesContextValue({
    entityTypeBaseUrl,
  });

  const formMethods = useEntityTypeForm<
    /**
     * @todo add icon support in `@hashintel/type-editor`
     *
     * @see https://linear.app/hash/issue/H-1439/move-icon-and-labelproperty-to-the-metadata-types-in-bp-so-that-it-can
     */
    EntityTypeEditorFormData & { icon?: string | null }
  >({
    defaultValues: { allOf: [], properties: [], links: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset, watch } = formMethods;

  useEffect(() => {
    if (draftEntityType) {
      reset(getFormDataFromSchema(draftEntityType));
    }
  }, [draftEntityType, reset]);

  const [
    remoteEntityType,
    latestVersion,
    remotePropertyTypes,
    updateEntityType,
    publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    entityTypeBaseUrl ?? null,
    requestedVersion,
    accountId ?? null,
    (fetchedEntityType) => {
      // Load the initial form data after the entity type has been fetched
      reset({
        ...getFormDataFromSchema(fetchedEntityType.schema),
        icon: fetchedEntityType.metadata.icon,
      });
    },
  );

  const entityType = remoteEntityType?.schema ?? draftEntityType;

  const parentRefs = formMethods.watch("allOf");
  const { isLink, isFile, isImage } = useIsSpecialEntityType({
    allOf: parentRefs.map((id) => ({ $ref: id })),
    $id: entityType?.$id,
  });

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadonly = readonly || !isLatest;

  const entityTypeAndPropertyTypes = useMemo(
    () =>
      entityType
        ? {
            entityType,
            propertyTypes: remotePropertyTypes ?? {},
          }
        : null,
    [entityType, remotePropertyTypes],
  );

  const isDirty = formMethods.formState.isDirty;
  const isDraft = !!draftEntityType;

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

    const entityTypeSchema = getSchemaFromFormData(data);

    if (draftEntityType) {
      await publishDraft(
        {
          ...draftEntityType,
          ...entityTypeSchema,
        },
        { icon: data.icon },
      );
      reset(data);
    } else {
      const currentEntityTypeId = entityType?.$id;
      if (!currentEntityTypeId) {
        throw new Error(
          "Cannot update entity type without existing entityType schema",
        );
      }

      /**
       * If an entity type refers to itself as a link destination, e.g. a Company may have a Parent which is a Company,
       * we want the version specified as the link target in the schema to be the same as the version of the entity type.
       * This rewriting of the schema ensures that by looking for self references and giving them the expected next version.
       * If we don't do this, creating a new version of Company means the new version will have a link to the previous version.
       */
      const schemaWithConsistentSelfReferences = {
        ...entityTypeSchema,
        links: generateLinkMapWithConsistentSelfReferences(
          entityTypeSchema,
          currentEntityTypeId,
        ),
      };

      const res = await updateEntityType(schemaWithConsistentSelfReferences, {
        icon: data.icon,
      });

      if (!res.errors?.length && res.data) {
        void router.push(
          generateLinkParameters(res.data.updateEntityType.schema.$id).href,
        );
      } else {
        throw new Error("Could not publish changes");
      }
    }
  });

  const currentTab = useCurrentTab();

  const [previewEntityTypeUrl, setPreviewEntityTypeUrl] =
    useState<VersionedUrl | null>(null);

  const onNavigateToType = (url: VersionedUrl) => {
    setPreviewEntityTypeUrl(url);
  };

  if (!entityType) {
    if (loadingRemoteEntityType) {
      return null;
    } else if (isHrefExternal(entityTypeBaseUrl as string)) {
      return (
        <Container sx={{ mt: 8 }}>
          <Typography variant="h2" mb={4}>
            External type not found in database
          </Typography>
          <Typography mb={3}>
            This type wasn't created in this instance of HASH and isn't in use
            by any types or entities in it.
          </Typography>
        </Container>
      );
    } else {
      return <PageErrorState />;
    }
  }

  const currentVersion = draftEntityType ? 0 : extractVersion(entityType.$id);

  const convertToLinkType = wrapHandleSubmit(async (data) => {
    const entityTypeSchema = getSchemaFromFormData(data);

    const res = await updateEntityType(
      {
        ...entityTypeSchema,
        allOf: [{ $ref: linkEntityTypeUrl }],
      },
      { icon: data.icon },
    );

    if (!res.errors?.length && res.data) {
      void router.push(
        generateLinkParameters(res.data.updateEntityType.schema.$id).href,
      );
    } else {
      throw new Error("Could not publish changes");
    }
  });

  const icon = watch("icon");

  return (
    <>
      <NextSeo title={`${entityType.title} | Entity Type`} />
      <EntityTypeFormProvider {...formMethods}>
        <EntityTypeContext.Provider value={entityType}>
          <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
            <Box display="contents" component="form" onSubmit={handleSubmit}>
              <TopContextBar
                actionMenuItems={[
                  ...(remoteEntityType && !isTypeArchived(remoteEntityType)
                    ? [
                        <ArchiveMenuItem
                          key={entityType.$id}
                          item={remoteEntityType}
                        />,
                      ]
                    : []),
                  ...(!isReadonly && !isDraft && !isLink
                    ? [
                        <ConvertTypeMenuItem
                          key={entityType.$id}
                          convertToLinkType={convertToLinkType}
                          disabled={isDirty}
                          typeTitle={entityType.title}
                        />,
                      ]
                    : []),
                ]}
                defaultCrumbIcon={null}
                item={remoteEntityType ?? undefined}
                crumbs={[
                  {
                    href: "/types",
                    title: "Types",
                    id: "types",
                  },
                  {
                    href: "/types/entity-type",
                    title: `${isLink ? "Link" : "Entity"} Types`,
                    id: "entity-types",
                  },
                  {
                    title: entityType.title,
                    href: "#",
                    id: entityType.$id,
                    icon:
                      icon ??
                      (isLink ? (
                        <LinkTypeIcon
                          sx={({ palette }) => ({
                            stroke: palette.gray[50],
                          })}
                        />
                      ) : (
                        <EntityTypeIcon
                          sx={({ palette }) => ({
                            fill: palette.gray[50],
                          })}
                        />
                      )),
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
                  key={entityType.$id} // reset edit bar state when the entity type changes
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
                <Container>
                  <EntityTypeHeader
                    isDraft={isDraft}
                    ontologyChip={
                      <OntologyChip
                        domain={new URL(entityType.$id).hostname}
                        path={new URL(entityType.$id).pathname.replace(
                          /\d+$/,
                          currentVersion.toString(),
                        )}
                      />
                    }
                    entityType={entityType}
                    isLink={isLink}
                    isReadonly={isReadonly}
                    latestVersion={latestVersion}
                  />

                  <EntityTypeTabs
                    isDraft={isDraft}
                    isFile={isFile}
                    isImage={isImage}
                  />
                </Container>
              </Box>

              <Box py={5}>
                <Container>
                  {currentTab === "definition" ? (
                    entityTypeAndPropertyTypes ? (
                      <DefinitionTab
                        entityTypeAndPropertyTypes={entityTypeAndPropertyTypes}
                        onNavigateToType={onNavigateToType}
                        ownedById={accountId as OwnedById | null}
                        readonly={isReadonly}
                      />
                    ) : (
                      "Loading..."
                    )
                  ) : null}
                  {currentTab === "entities" ? <EntitiesTab /> : null}
                  {isFile && currentTab === "upload" ? (
                    <FileUploadsTab isImage={isImage} />
                  ) : null}
                </Container>
              </Box>
            </Box>
          </EntityTypeEntitiesContext.Provider>
        </EntityTypeContext.Provider>
      </EntityTypeFormProvider>

      {previewEntityTypeUrl ? (
        <TypePreviewSlide
          key={previewEntityTypeUrl}
          onClose={() => setPreviewEntityTypeUrl(null)}
          onNavigateToType={onNavigateToType}
          typeUrl={previewEntityTypeUrl}
        />
      ) : null}

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
