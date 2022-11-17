import {
  EntityType,
  extractBaseUri,
  extractVersion,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system-web";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Typography } from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { frontendUrl } from "@hashintel/hash-shared/environment";
import { TopContextBar } from "../../../shared/top-context-bar";
import { HashOntologyIcon } from "../../shared/hash-ontology-icon";
import { OntologyChip } from "../../shared/ontology-chip";
import { EditBar } from "./edit-bar";
import {
  EntityTypeEditorForm,
  EntityTypeEditorPropertyData,
} from "./form-types";
import { useRouteNamespace } from "./use-route-namespace";
import { mustBeVersionedUri } from "./util";
import {
  EntityTypeEntitiesContext,
  useEntityTypeEntitiesContextValue,
} from "./use-entity-type-entities";
import { EntityTypeTabs, getTabFromQuery } from "./entity-type-tabs";
import { EntityTypeContext, useEntityTypeValue } from "./use-entity-type";
import { NextPageWithLayout } from "../../../../shared/layout";
import { getPlainLayout } from "../../../../shared/layout/plain-layout";
import { DefinitionTab } from "./tabs/definition-tab";
import { EntitiesTab } from "./tabs/entities-tab";

export const getEntityTypeBaseUri = (entityTypeId: string, namespace: string) =>
  `${frontendUrl}/${namespace}/types/entity-type/${entityTypeId}/`;

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

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  // @todo how to handle remote types
  const isDraft = !!router.query.draft;
  const namespace = useRouteNamespace();

  const entityTypeId = router.query["entity-type-id"] as string;
  const baseEntityTypeUri = !isDraft
    ? getEntityTypeBaseUri(entityTypeId, router.query["account-slug"] as string)
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

  const formMethods = useForm<EntityTypeEditorForm>({
    defaultValues: { properties: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

  const [remoteEntityType, updateEntityType, publishDraft] = useEntityTypeValue(
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

  const currentTab = getTabFromQuery(router.query.tab as string);

  return (
    <FormProvider {...formMethods}>
      <EntityTypeContext.Provider value={entityType}>
        <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
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

                  <EntityTypeTabs />
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
    </FormProvider>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
