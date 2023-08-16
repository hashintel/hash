import { extractVersion, validateEntityType } from "@blockprotocol/type-system";
import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  OntologyChip,
  OntologyIcon,
} from "@hashintel/design-system";
import {
  EntityTypeEditorFormData,
  EntityTypeFormProvider,
  getFormDataFromSchema,
  getSchemaFromFormData,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import { linkEntityTypeUrl, OwnedById } from "@local/hash-subgraph";
import { Box, Container, Theme, Typography } from "@mui/material";
import { GlobalStyles } from "@mui/system";
// eslint-disable-next-line unicorn/prefer-node-protocol -- https://github.com/sindresorhus/eslint-plugin-unicorn/issues/1931#issuecomment-1359324528
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useMemo, useState } from "react";

import { PageErrorState } from "../../../../components/page-error-state";
import { isLinkEntityType } from "../../../../shared/entity-types-context/util";
import { isHrefExternal } from "../../../../shared/is-href-external";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { useIsReadonlyModeForResource } from "../../../../shared/readonly-mode";
import { TopContextBar } from "../../../shared/top-context-bar";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { ConvertTypeButton } from "./[...slug-maybe-version].page/convert-type-button";
import { DefinitionTab } from "./[...slug-maybe-version].page/definition-tab";
import { EditBarTypeEditor } from "./[...slug-maybe-version].page/edit-bar-type-editor";
import { EntitiesTab } from "./[...slug-maybe-version].page/entities-tab";
import { EntityTypeTabs } from "./[...slug-maybe-version].page/entity-type-tabs";
import { EntityTypeContext } from "./[...slug-maybe-version].page/shared/entity-type-context";
import { EntityTypeEntitiesContext } from "./[...slug-maybe-version].page/shared/entity-type-entities-context";
import { EntityTypeHeader } from "./[...slug-maybe-version].page/shared/entity-type-header";
import { getEntityTypeBaseUrl } from "./[...slug-maybe-version].page/shared/get-entity-type-base-url";
import { useCurrentTab } from "./[...slug-maybe-version].page/shared/tabs";
import { TypePreviewSlide } from "./[...slug-maybe-version].page/type-preview-slide";
import { useEntityTypeEntitiesContextValue } from "./[...slug-maybe-version].page/use-entity-type-entities-context-value";
import { useEntityTypeValue } from "./[...slug-maybe-version].page/use-entity-type-value";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  // @todo how to handle remote types
  const isDraft = !!router.query.draft;
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  const [convertTypeLoading, setConvertTypeLoading] = useState(false);

  const [slug, _, requestedVersionString] = router.query[
    "slug-maybe-version"
  ] as [string, "v" | undefined, `${number}` | undefined]; // @todo validate that the URL is formatted as expected;

  const baseEntityTypeUrl = !isDraft
    ? getEntityTypeBaseUrl(slug, router.query.shortname as string)
    : null;

  const entityTypeEntitiesValue =
    useEntityTypeEntitiesContextValue(baseEntityTypeUrl);

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { allOf: [], properties: [], links: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

  const draftEntityType = useMemo(() => {
    if (router.query.draft) {
      const entityType = JSON.parse(
        Buffer.from(
          decodeURIComponent(router.query.draft.toString()),
          "base64",
        ).toString("utf8"),
      );

      const validationResult = validateEntityType(entityType);
      if (validationResult.type === "Ok") {
        reset(getFormDataFromSchema(entityType));
        return entityType as EntityType;
      } else {
        throw Error(
          `Invalid draft entity type: ${JSON.stringify(validationResult)}`,
        );
      }
    } else {
      return null;
    }
  }, [reset, router.query.draft]);

  const requestedVersion = requestedVersionString
    ? parseInt(requestedVersionString, 10)
    : null;

  const [
    remoteEntityType,
    latestVersion,
    remotePropertyTypes,
    updateEntityType,
    publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    baseEntityTypeUrl,
    requestedVersion,
    routeNamespace?.accountId ?? null,
    (fetchedEntityType) => {
      if (isHrefExternal(fetchedEntityType.schema.$id)) {
        // In the current routing this should never be the case, but this is a marker to handle it when external types exist
        window.open(fetchedEntityType.schema.$id);
      }

      // Load the initial form data after the entity type has been fetched
      reset(getFormDataFromSchema(fetchedEntityType.schema));
    },
  );

  const entityType = remoteEntityType?.schema ?? draftEntityType;

  const userUnauthorized = useIsReadonlyModeForResource(
    routeNamespace?.accountId,
  );

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadonly = userUnauthorized || !isLatest;

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

  const handleSubmit = wrapHandleSubmit(async (data) => {
    const entityTypeSchema = getSchemaFromFormData(data);

    if (isDraft) {
      if (!draftEntityType) {
        throw new Error("Cannot publish without draft");
      }

      await publishDraft({
        ...draftEntityType,
        ...entityTypeSchema,
      });
      reset(data);
    } else {
      const res = await updateEntityType({
        ...entityTypeSchema,
      });

      if (!res.errors?.length && res.data) {
        void router.push(res.data.schema.$id);
      } else {
        throw new Error("Could not publish changes");
      }
    }
  });

  const currentTab = useCurrentTab();

  const [previewEntityTypeUrl, setPreviewEntityTypeUrl] =
    useState<VersionedUrl | null>(null);

  const onNavigateToType = (url: VersionedUrl) => {
    if (isHrefExternal(url)) {
      window.open(url);
    } else {
      setPreviewEntityTypeUrl(url);
    }
  };

  if (!entityType) {
    if (loadingRemoteEntityType) {
      return null;
    } else {
      return <PageErrorState />;
    }
  }

  if (!routeNamespace) {
    if (loadingNamespace) {
      return null;
    } else {
      throw new Error("Namespace for valid entity somehow missing");
    }
  }

  const currentVersion = draftEntityType ? 0 : extractVersion(entityType.$id);

  const entityTypeIsLink = isLinkEntityType(entityType);

  const convertToLinkType = wrapHandleSubmit(async (data) => {
    const entityTypeSchema = getSchemaFromFormData(data);

    setConvertTypeLoading(true);
    const res = await updateEntityType({
      ...entityTypeSchema,
      allOf: [{ $ref: linkEntityTypeUrl }],
    });

    setConvertTypeLoading(false);
    if (!res.errors?.length && res.data) {
      void router.push(res.data.schema.$id);
    } else {
      throw new Error("Could not publish changes");
    }
  });

  const isDirty = formMethods.formState.isDirty;

  return (
    <>
      <NextSeo title={`${entityType.title} | Entity Type`} />
      <EntityTypeFormProvider {...formMethods}>
        <EntityTypeContext.Provider value={entityType}>
          <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
            <Box display="contents" component="form" onSubmit={handleSubmit}>
              <TopContextBar
                defaultCrumbIcon={null}
                item={remoteEntityType ?? undefined}
                crumbs={[
                  {
                    title: "Types",
                    id: "types",
                  },
                  {
                    title: `${entityTypeIsLink ? "Link" : "Entity"} Types`,
                    id: "entity-types",
                  },
                  {
                    title: entityType.title,
                    href: "#",
                    id: entityType.$id,
                    icon: <FontAwesomeIcon icon={faAsterisk} />,
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
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="flex-start"
                  >
                    <EntityTypeHeader
                      ontologyChip={
                        <OntologyChip
                          icon={<OntologyIcon />}
                          domain="hash.ai"
                          path={
                            <>
                              <Typography
                                component="span"
                                fontWeight="bold"
                                color={(theme) => theme.palette.blue[70]}
                              >
                                {router.query.shortname}
                              </Typography>
                              <Typography
                                component="span"
                                color={(theme) => theme.palette.blue[70]}
                              >
                                /types/entity-type/
                              </Typography>
                              <Typography
                                component="span"
                                fontWeight="bold"
                                color={(theme) => theme.palette.blue[70]}
                              >
                                {slug}
                              </Typography>
                              <Typography
                                component="span"
                                color={(theme) => theme.palette.blue[70]}
                              >
                                /v/{currentVersion}
                              </Typography>
                            </>
                          }
                        />
                      }
                      entityType={entityType}
                      isReadonly={isReadonly}
                      latestVersion={latestVersion}
                    />
                    {!isReadonly && !isDraft && !entityTypeIsLink ? (
                      <ConvertTypeButton
                        onClick={convertToLinkType}
                        loading={convertTypeLoading}
                        disabled={isDirty}
                      />
                    ) : null}
                  </Box>

                  <EntityTypeTabs isDraft={isDraft} />
                </Container>
              </Box>

              <Box py={5}>
                <Container>
                  {currentTab === "definition" ? (
                    entityTypeAndPropertyTypes ? (
                      <DefinitionTab
                        entityTypeAndPropertyTypes={entityTypeAndPropertyTypes}
                        onNavigateToType={onNavigateToType}
                        ownedById={routeNamespace.accountId as OwnedById}
                        readonly={isReadonly}
                      />
                    ) : (
                      "Loading..."
                    )
                  ) : null}
                  {currentTab === "entities" ? <EntitiesTab /> : null}
                </Container>
              </Box>
            </Box>
          </EntityTypeEntitiesContext.Provider>
        </EntityTypeContext.Provider>
      </EntityTypeFormProvider>

      {previewEntityTypeUrl ? (
        <TypePreviewSlide
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

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
