import { extractVersion } from "@blockprotocol/type-system";
import { EntityType } from "@blockprotocol/type-system/slim";
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
import { OwnedById } from "@local/hash-subgraph";
import { Box, Container, Theme, Typography } from "@mui/material";
import { GlobalStyles } from "@mui/system";
// eslint-disable-next-line unicorn/prefer-node-protocol -- https://github.com/sindresorhus/eslint-plugin-unicorn/issues/1931#issuecomment-1359324528
import { Buffer } from "buffer/";
import Head from "next/head";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { PageErrorState } from "../../../../components/page-error-state";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { DefinitionTab } from "./[entity-type-id].page/definition-tab";
import { EditBarTypeEditor } from "./[entity-type-id].page/edit-bar-type-editor";
import { EntitiesTab } from "./[entity-type-id].page/entities-tab";
import { EntityTypeTabs } from "./[entity-type-id].page/entity-type-tabs";
import { EntityTypeContext } from "./[entity-type-id].page/shared/entity-type-context";
import { EntityTypeEntitiesContext } from "./[entity-type-id].page/shared/entity-type-entities-context";
import { getEntityTypeBaseUri } from "./[entity-type-id].page/shared/get-entity-type-base-uri";
import { LatestPropertyTypesContextProvider } from "./[entity-type-id].page/shared/latest-property-types-context";
import { useCurrentTab } from "./[entity-type-id].page/shared/tabs";
import { useEntityTypeEntitiesContextValue } from "./[entity-type-id].page/use-entity-type-entities-context-value";
import { useEntityTypeValue } from "./[entity-type-id].page/use-entity-type-value";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  // @todo how to handle remote types
  const isDraft = !!router.query.draft;
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  const entityTypeId = router.query["entity-type-id"] as string;
  const baseEntityTypeUri = !isDraft
    ? getEntityTypeBaseUri(entityTypeId, router.query.shortname as string)
    : null;

  const entityTypeEntitiesValue =
    useEntityTypeEntitiesContextValue(baseEntityTypeUri);

  const draftEntityType = useMemo(() => {
    if (router.query.draft) {
      // @todo use validation when validateEntityType doesn't return undefined
      return JSON.parse(
        Buffer.from(
          decodeURIComponent(router.query.draft.toString()),
          "base64",
        ).toString("ascii"),
      ) as EntityType;
    } else {
      return null;
    }
  }, [router.query.draft]);

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { properties: [], links: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

  const [
    remoteEntityType,
    remotePropertyTypes,
    updateEntityType,
    publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    baseEntityTypeUri,
    routeNamespace?.accountId ?? null,
    (fetchedEntityType) => {
      reset(getFormDataFromSchema(fetchedEntityType));
    },
  );

  const entityType = remoteEntityType ?? draftEntityType;

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

      if (!res.errors?.length) {
        reset(data);
      } else {
        throw new Error("Could not publish changes");
      }
    }
  });

  const currentTab = useCurrentTab();

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

  return (
    <>
      <Head>
        <title>{entityType.title} | Entity Type | HASH</title>
      </Head>
      <EntityTypeFormProvider {...formMethods}>
        <LatestPropertyTypesContextProvider>
          <EntityTypeContext.Provider value={entityType}>
            <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
              <Box display="contents" component="form" onSubmit={handleSubmit}>
                <TopContextBar
                  defaultCrumbIcon={null}
                  crumbs={[
                    {
                      title: "Types",
                      href: "#",
                      id: "types",
                    },
                    {
                      title: "Entity types",
                      href: "#",
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

                <Box
                  sx={{
                    borderBottom: 1,
                    borderColor: "gray.20",
                    pt: 3.75,
                    backgroundColor: "white",
                  }}
                >
                  <Container>
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
                            /types/entity-types/
                          </Typography>
                          <Typography
                            component="span"
                            fontWeight="bold"
                            color={(theme) => theme.palette.blue[70]}
                          >
                            {entityTypeId}
                          </Typography>
                        </>
                      }
                    />
                    <Typography variant="h1" fontWeight="bold" mt={3} mb={5.25}>
                      <FontAwesomeIcon
                        icon={faAsterisk}
                        sx={(theme) => ({
                          fontSize: 40,
                          mr: 3,
                          color: theme.palette.gray[70],
                          verticalAlign: "middle",
                        })}
                      />
                      {entityType.title}
                    </Typography>

                    <EntityTypeTabs isDraft={isDraft} />
                  </Container>
                </Box>

                <Box py={5}>
                  <Container>
                    {currentTab === "definition" ? (
                      entityTypeAndPropertyTypes ? (
                        <DefinitionTab
                          entityTypeAndPropertyTypes={
                            entityTypeAndPropertyTypes
                          }
                          ownedById={routeNamespace.accountId as OwnedById}
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
        </LatestPropertyTypesContextProvider>
      </EntityTypeFormProvider>
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
