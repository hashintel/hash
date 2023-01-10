import {
  EntityType,
  extractBaseUri,
  extractVersion,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Container, Theme, Typography } from "@mui/material";
import { GlobalStyles } from "@mui/system";
// eslint-disable-next-line unicorn/prefer-node-protocol -- https://github.com/sindresorhus/eslint-plugin-unicorn/issues/1931#issuecomment-1359324528
import { Buffer } from "buffer/";
import Head from "next/head";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { PageErrorState } from "../../../../components/page-error-state";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { HashOntologyIcon } from "../../shared/hash-ontology-icon";
import { OntologyChip } from "../../shared/ontology-chip";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { DefinitionTab } from "./[entity-type-id].page/definition-tab";
import { EditBar } from "./[entity-type-id].page/edit-bar-type-editor";
import { EntitiesTab } from "./[entity-type-id].page/entities-tab";
import { EntityTypeTabs } from "./[entity-type-id].page/entity-type-tabs";
import { EntityTypeContext } from "./[entity-type-id].page/shared/entity-type-context";
import { EntityTypeEntitiesContext } from "./[entity-type-id].page/shared/entity-type-entities-context";
import { EntityTypeEditorForm } from "./[entity-type-id].page/shared/form-types";
import { getEntityTypeBaseUri } from "./[entity-type-id].page/shared/get-entity-type-base-uri";
import { PropertyTypesContext } from "./[entity-type-id].page/shared/property-types-context";
import { useCurrentTab } from "./[entity-type-id].page/shared/tabs";
import { usePropertyTypesContextValue } from "./[entity-type-id].page/shared/use-property-types-context-value";
import { useEntityTypeEntitiesContextValue } from "./[entity-type-id].page/use-entity-type-entities-context-value";
import { useEntityTypeValue } from "./[entity-type-id].page/use-entity-type-value";

const getSchemaFromEditorForm = (
  data: EntityTypeEditorForm,
): Partial<EntityType> => {
  const properties = data.properties;

  const schemaProperties: Record<
    string,
    ValueOrArray<PropertyTypeReference>
  > = {};
  const required = [];

  for (const property of properties) {
    const propertyKey = extractBaseUri(property.$id);

    if (
      typeof property.minValue === "string" ||
      typeof property.maxValue === "string"
    ) {
      throw new Error("Invalid property constraint");
    }

    const prop: ValueOrArray<PropertyTypeReference> = property.array
      ? {
          type: "array",
          minItems: property.minValue,
          items: { $ref: property.$id },
          ...(property.infinity ? {} : { maxItems: property.maxValue }),
        }
      : { $ref: property.$id };

    schemaProperties[propertyKey] = prop;

    if (property.required) {
      required.push(extractBaseUri(property.$id));
    }
  }

  const links: NonNullable<EntityType["links"]> = {};

  for (const link of data.links) {
    if (
      typeof link.minValue === "string" ||
      typeof link.maxValue === "string"
    ) {
      throw new Error("Invalid property constraint");
    }

    links[link.$id] = {
      type: "array",
      minItems: link.minValue,
      ...(link.infinity ? {} : { maxItems: link.maxValue }),
      ordered: false,
      items: { oneOf: link.entityTypes.map((id) => ({ $ref: id })) },
    };
  }

  return {
    properties: schemaProperties,
    links,
    required,
  };
};

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

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

  const propertyTypes = usePropertyTypesContextValue();

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
    defaultValues: { properties: [], links: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

  const [
    remoteEntityType,
    updateEntityType,
    publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    baseEntityTypeUri,
    routeNamespace?.accountId ?? null,
    (fetchedEntityType) => {
      reset({
        properties: Object.entries(fetchedEntityType.properties).map(
          ([propertyId, ref]) => {
            const isArray = "type" in ref;

            return {
              $id: isArray ? ref.items.$ref : ref.$ref,
              required: !!fetchedEntityType.required?.includes(propertyId),
              array: isArray,
              maxValue: isArray ? ref.maxItems ?? 1 : 1,
              minValue: isArray ? ref.minItems ?? 0 : 0,
              infinity: isArray && typeof ref.maxItems !== "number",
            };
          },
        ),
        links: fetchedEntityType.links
          ? (
              Object.entries(fetchedEntityType.links) as Entries<
                typeof fetchedEntityType.links
              >
            ).map(([linkEntityTypeId, link]) => ({
              $id: linkEntityTypeId,
              array: true,
              maxValue: link.maxItems ?? 1,
              minValue: link.minItems ?? 0,
              infinity: typeof link.maxItems !== "number",
              entityTypes:
                "oneOf" in link.items
                  ? link.items.oneOf.map((ref) => ref.$ref)
                  : [],
            }))
          : [],
      });
    },
  );

  const entityType = remoteEntityType ?? draftEntityType;

  const handleSubmit = wrapHandleSubmit(async (data) => {
    const entityTypeSchema = getSchemaFromEditorForm(data);

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
      <FormProvider {...formMethods}>
        <PropertyTypesContext.Provider value={propertyTypes}>
          <EntityTypeContext.Provider value={entityType}>
            <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                }}
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
                            href: `/new/types/entity-type`,
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
                      <Typography
                        variant="h1"
                        fontWeight="bold"
                        mt={3}
                        mb={5.25}
                      >
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
                </Box>

                <Box py={5}>
                  <Container>
                    {currentTab === "definition" ? <DefinitionTab /> : null}
                    {currentTab === "entities" ? <EntitiesTab /> : null}
                  </Container>
                </Box>
              </Box>
            </EntityTypeEntitiesContext.Provider>
          </EntityTypeContext.Provider>
        </PropertyTypesContext.Provider>
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

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
