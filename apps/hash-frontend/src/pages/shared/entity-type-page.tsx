import type { EntityTypeWithMetadata } from "@blockprotocol/graph";
import { atLeastOne, extractVersion } from "@blockprotocol/type-system";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  EntityTypeIcon,
  LinkTypeIcon,
  OntologyChip,
} from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import {
  EntityTypeFormProvider,
  getEntityTypeFromFormData,
  getFormDataFromEntityType,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import type { AccountId } from "@local/hash-graph-types/account";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateLinkMapWithConsistentSelfReferences } from "@local/hash-isomorphic-utils/ontology-types";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import type { Theme } from "@mui/material";
import { Box, Container, Typography } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo, useRef, useState } from "react";

import { PageErrorState } from "../../components/page-error-state";
import { EntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { useEntityTypeEntitiesContextValue } from "../../shared/entity-type-entities-context/use-entity-type-entities-context-value";
import { useIsSpecialEntityType } from "../../shared/entity-types-context/hooks";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { isTypeArchived } from "../../shared/is-archived";
import { isHrefExternal } from "../../shared/is-href-external";
import { useUserPermissionsOnEntityType } from "../../shared/use-user-permissions-on-entity-type";
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
import { TypeSlideOverStack } from "./entity-type-page/type-slide-over-stack";
import { useEntityTypeValue } from "./entity-type-page/use-entity-type-value";
import { TopContextBar } from "./top-context-bar";

type EntityTypeProps = {
  accountId?: AccountId | null;
  draftEntityType?: EntityTypeWithMetadata | null;
  entityTypeBaseUrl?: BaseUrl;
  requestedVersion: number | null;
};

export const EntityTypePage = ({
  accountId,
  draftEntityType,
  entityTypeBaseUrl,
  requestedVersion,
}: EntityTypeProps) => {
  const router = useRouter();

  const entityTypeEntitiesValue = useEntityTypeEntitiesContextValue({
    entityTypeBaseUrl,
  });

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { allOf: [], properties: [], links: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset, watch } = formMethods;

  useEffect(() => {
    if (draftEntityType) {
      reset(getFormDataFromEntityType(draftEntityType));
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
        ...getFormDataFromEntityType(fetchedEntityType),
        icon: fetchedEntityType.metadata.icon,
      });
    },
  );

  const entityType = remoteEntityType ?? draftEntityType;

  const parentRefs = formMethods.watch("allOf");
  const { isLink, isFile, isImage } = useIsSpecialEntityType({
    allOf: atLeastOne(parentRefs.map((id) => ({ $ref: id }))),
    $id: entityType?.schema.$id,
  });

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

  const { userPermissions } = useUserPermissionsOnEntityType(
    entityType?.schema.$id,
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

    const { labelProperty, schema: entityTypeSchema } =
      getEntityTypeFromFormData(data);

    if (draftEntityType) {
      await publishDraft(
        {
          ...draftEntityType.schema,
          ...entityTypeSchema,
        },
        {
          icon: data.icon,
          labelProperty:
            (labelProperty as BaseUrl | null | undefined) ?? undefined,
        },
      );
      reset(data);
    } else {
      const currentEntityTypeId = entityType?.schema.$id;
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
        labelProperty:
          (labelProperty as BaseUrl | null | undefined) ?? undefined,
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

  const titleWrapperRef = useRef<HTMLDivElement>(null);

  const onNavigateToType = (url: VersionedUrl) => {
    if (entityType && url === entityType.schema.$id) {
      titleWrapperRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setPreviewEntityTypeUrl(url);
    }
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

  if (!userPermissions) {
    return null;
  }

  const currentVersion = draftEntityType
    ? 0
    : extractVersion(entityType.schema.$id);

  const convertToLinkType = wrapHandleSubmit(async (data) => {
    const { icon, labelProperty, schema } = getEntityTypeFromFormData(data);

    const res = await updateEntityType(
      {
        ...schema,
        allOf: [{ $ref: linkEntityTypeUrl }, ...(schema.allOf ?? [])],
      },
      { icon, labelProperty: labelProperty as BaseUrl },
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

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadonly = !draftEntityType && (!userPermissions.edit || !isLatest);

  return (
    <>
      <NextSeo title={`${entityType.schema.title} | Entity Type`} />
      <EntityTypeFormProvider {...formMethods}>
        <EntityTypeContext.Provider value={entityType.schema}>
          <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
            <Box display="contents" component="form" onSubmit={handleSubmit}>
              <TopContextBar
                actionMenuItems={[
                  ...(remoteEntityType && !isTypeArchived(remoteEntityType)
                    ? [
                        <ArchiveMenuItem
                          key={entityType.schema.$id}
                          item={remoteEntityType}
                        />,
                      ]
                    : []),
                  ...(!isReadonly && !isDraft && !isLink
                    ? [
                        <ConvertTypeMenuItem
                          key={entityType.schema.$id}
                          convertToLinkType={convertToLinkType}
                          disabled={isDirty}
                          typeTitle={entityType.schema.title}
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
                    title: entityType.schema.title,
                    href: "#",
                    id: entityType.schema.$id,
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
                  key={entityType.schema.$id} // reset edit bar state when the entity type changes
                />
              )}

              <Box
                ref={titleWrapperRef}
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
                        domain={new URL(entityType.schema.$id).hostname}
                        path={new URL(entityType.schema.$id).pathname.replace(
                          /\d+$/,
                          currentVersion.toString(),
                        )}
                      />
                    }
                    entityTypeSchema={entityType.schema}
                    isLink={isLink}
                    isReadonly={isReadonly}
                    latestVersion={latestVersion}
                  />

                  <EntityTypeTabs
                    canCreateEntity={userPermissions.instantiate}
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
        <TypeSlideOverStack
          rootTypeId={previewEntityTypeUrl}
          onClose={() => setPreviewEntityTypeUrl(null)}
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
