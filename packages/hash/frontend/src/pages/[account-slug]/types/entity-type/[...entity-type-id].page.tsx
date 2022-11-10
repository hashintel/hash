import {
  EntityType,
  extractBaseUri,
  extractVersion,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system-web";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Stack, Tab, Tabs, Typography } from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FRONTEND_URL } from "../../../../lib/config";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { EditBar } from "./edit-bar";
import {
  EntityTypeEditorForm,
  EntityTypeEditorPropertyData,
} from "./form-types";
import { HashOntologyIcon } from "../../shared/hash-ontology-icon";
import { OntologyChip } from "../../shared/ontology-chip";
import { useEntityType } from "./use-entity-type";
import {
  PropertyTypesContext,
  usePropertyTypesContextValue,
} from "./use-property-types";
import { useRouteNamespace } from "./use-route-namespace";
import { mustBeVersionedUri } from "./util";
import { EntitiesTab } from "./tabs/entities-tab";
import { DefinitionTab } from "./tabs/definition-tab";
import { useEntityTypeEntities } from "../../../../components/hooks/useEntityTypeEntities";

const getBaseUri = (entityTypeId: string, namespace: string) =>
  `${FRONTEND_URL}/${namespace}/types/entity-type/${entityTypeId}/`;

const getSchemaFromEditorForm = (
  properties: EntityTypeEditorPropertyData[],
): Partial<EntityType> => {
  const schemaProperties: Record<
    string,
    ValueOrArray<PropertyTypeReference>
  > = {};
  const required = [];

  for (const property of properties) {
    const propertyKey = extractBaseUri(property.$id);

    const prop: ValueOrArray<PropertyTypeReference> = property.array
      ? {
          type: "array",
          minItems: property.minValue,
          maxItems: property.maxValue,
          items: { $ref: property.$id },
        }
      : { $ref: property.$id };

    schemaProperties[propertyKey] = prop;

    if (property.required) {
      required.push(extractBaseUri(property.$id));
    }
  }

  return {
    properties: schemaProperties,
    required,
  };
};

// @todo loading state
const Page: NextPageWithLayout = () => {
  const router = useRouter();

  // @todo how to handle remote types
  const isDraft = !!router.query.draft;
  const namespace = useRouteNamespace();
  const entityTypeId = router.query["entity-type-id"][0];
  const baseEntityTypeUri = isDraft
    ? null
    : getBaseUri(entityTypeId, router.query["account-slug"]);

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

  const formMethods = useForm<EntityTypeEditorForm>({
    defaultValues: { properties: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

  const [remoteEntityType, updateEntityType, publishDraft] = useEntityType(
    baseEntityTypeUri,
    namespace?.id,
    (fetchedEntityType) => {
      reset({
        properties: Object.entries(fetchedEntityType.properties).map(
          ([propertyId, ref]) => {
            const isArray = "type" in ref;

            return {
              $id: mustBeVersionedUri(isArray ? ref.items.$ref : ref.$ref),
              required: !!fetchedEntityType.required?.includes(propertyId),
              array: isArray,
              maxValue: isArray ? ref.maxItems : 0,
              minValue: isArray ? ref.minItems : 0,
            };
          },
        ),
      });
    },
  );

  const entityType = remoteEntityType ?? draftEntityType;

  const { subgraph: typeEntitiesSubgraph } = useEntityTypeEntities(
    "http://localhost:3000/@example/types/entity-type/user/",
  );

  const NAVIGATION_TABS = useMemo(
    () => [
      {
        id: "definition",
        label: "Definition",
        path: "",
        numberIndicator: 3,
      },
      {
        id: "entities",
        label: "Entities",
        path: "entities",
        numberIndicator: typeEntitiesSubgraph?.roots.length,
      },
      {
        id: "views",
        label: "Views",
        path: "",
      },
      {
        id: "dependents",
        label: "Dependents",
        path: "",
      },
      {
        id: "activity",
        label: "Activity",
        path: "",
      },
    ],
    [typeEntitiesSubgraph],
  );

  const [activeTab, setActiveTab] = useState(() => {
    const activePath = router.query["entity-type-id"]?.[1] ?? "";
    const tabIndex = NAVIGATION_TABS.findIndex(
      (tab) => tab.path === activePath,
    );

    return tabIndex >= 0 ? tabIndex : 0;
  });

  const propertyTypes = usePropertyTypesContextValue();

  const handleSubmit = wrapHandleSubmit(async (data) => {
    if (!entityType) {
      return;
    }

    const entityTypeSchema = getSchemaFromEditorForm(data.properties);

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

  if (!entityType || !namespace) {
    return null;
  }

  const currentVersion = draftEntityType
    ? 0
    : extractVersion(mustBeVersionedUri(entityType.$id));

  return (
    <PropertyTypesContext.Provider value={propertyTypes}>
      <FormProvider {...formMethods}>
        <Box
          sx={(theme) => ({
            minHeight: "100vh",
            background: theme.palette.gray[10],
            display: "flex",
            flexDirection: "column",
          })}
          component="form"
          onSubmit={handleSubmit}
        >
          <Box bgcolor="white" borderBottom={1} borderColor="gray.20">
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
            />
            <EditBar
              currentVersion={currentVersion}
              discardButtonProps={
                // @todo confirmation of discard when draft
                isDraft
                  ? {
                      href: `/${router.query["account-slug"]}/types/new/entity-type`,
                    }
                  : {
                      onClick() {
                        reset();
                      },
                    }
              }
            />

            <Box pt={3.75}>
              <Container>
                <OntologyChip
                  icon={<HashOntologyIcon />}
                  domain="hash.ai"
                  path={
                    <>
                      <Typography
                        component="span"
                        fontWeight="bold"
                        color={(theme) => theme.palette.blue[70]}
                      >
                        {router.query["account-slug"]}
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
                <Typography variant="h1" fontWeight="bold" mt={3} mb={4.5}>
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

                <Tabs
                  value={activeTab}
                  onChange={(_, index) => {
                    void router.push(
                      `/@${namespace?.shortname}/types/entity-type/${entityTypeId}/${NAVIGATION_TABS[index]?.path}`,
                      undefined,
                      { shallow: true },
                    );
                    setActiveTab(index);
                  }}
                  TabIndicatorProps={{
                    sx: ({ palette }) => ({
                      height: 3,
                      backgroundColor: palette.blue[60],
                      minHeight: 0,
                    }),
                  }}
                >
                  {NAVIGATION_TABS.map((tab, index) => (
                    <Tab
                      label={
                        <Stack direction="row">
                          <Typography
                            variant="smallTextLabels"
                            fontWeight={500}
                            sx={{
                              paddingY: 0.25,
                            }}
                          >
                            {tab.label}
                          </Typography>
                          {tab.numberIndicator ? (
                            <Box
                              sx={({ palette }) => ({
                                marginLeft: 1,
                                paddingX: 1,
                                paddingY: 0.25,
                                borderRadius: "50%",
                                background:
                                  activeTab === index
                                    ? palette.blue[20]
                                    : palette.gray[20],
                              })}
                            >
                              <Typography
                                variant="microText"
                                sx={({ palette }) => ({
                                  fontWeight: 500,
                                  color:
                                    activeTab === index
                                      ? palette.primary.main
                                      : palette.gray[80],
                                })}
                              >
                                {tab.numberIndicator}
                              </Typography>
                            </Box>
                          ) : null}
                        </Stack>
                      }
                      id={tab.id}
                      key={tab.id}
                      sx={{
                        marginRight: 3,
                        paddingY: "11px",
                        paddingX: 0.5,
                        minWidth: 0,
                        minHeight: 0,
                      }}
                    />
                  ))}
                </Tabs>
              </Container>
            </Box>
          </Box>
          <Box py={5}>
            {activeTab === 0 ? (
              <DefinitionTab entityTypeTitle={entityType.title} />
            ) : null}
            {activeTab === 1 ? (
              <EntitiesTab
                entitiesSubgraph={typeEntitiesSubgraph}
                // subgraph={subgraph}
                entityType={entityType}
                namespace={namespace}
              />
            ) : null}
          </Box>
        </Box>
      </FormProvider>
    </PropertyTypesContext.Provider>
  );
};
Page.getLayout = getPlainLayout;

export default Page;
