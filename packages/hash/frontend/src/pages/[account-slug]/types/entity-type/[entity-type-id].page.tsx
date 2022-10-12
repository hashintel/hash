import {
  extractBaseUri,
  extractVersion,
  validateVersionedUri,
} from "@blockprotocol/type-system-web";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { FormProvider, useForm } from "react-hook-form";
import { FRONTEND_URL } from "../../../../lib/config";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { EditBar } from "./edit-bar";
import { EntityTypeEditorForm } from "./form-types";
import { HashOntologyIcon } from "./hash-ontology-icon";
import { OntologyChip } from "./ontology-chip";
import { PropertyListCard } from "./property-list-card";
import { useEntityType } from "./use-entity-type";
import {
  PropertyTypesContext,
  useRemotePropertyTypes,
} from "./use-property-types";

// @todo loading state
// @todo handle displaying entity type not yet created
const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const baseEntityTypeUri = `${FRONTEND_URL}/${router.query["account-slug"]}/types/entity-type/${router.query["entity-type-id"]}/`;

  const formMethods = useForm<EntityTypeEditorForm>({
    defaultValues: { properties: [] },
  });
  const { handleSubmit: wrapHandleSubmit, reset } = formMethods;

  const [entityType, updateEntityType] = useEntityType(
    baseEntityTypeUri,
    (fetchedEntityType) => {
      reset({
        properties: Object.values(fetchedEntityType.properties).map((ref) => {
          if ("type" in ref) {
            throw new Error("handle arrays");
          }
          const validatedRef = validateVersionedUri(ref.$ref);
          if (validatedRef.type === "Err") {
            throw new Error("How would this happen?");
          }
          return { $id: validatedRef.inner };
        }),
      });
    },
  );

  const propertyTypes = useRemotePropertyTypes();

  const handleSubmit = wrapHandleSubmit(async (data) => {
    if (!entityType) {
      return;
    }

    const properties = Object.fromEntries(
      data.properties.map((property) => {
        const propertyKey = extractBaseUri(property.$id);

        return [propertyKey, { $ref: property.$id }];
      }),
    );

    const res = await updateEntityType({
      properties,
    });

    if (!res.errors?.length) {
      reset(data);
    } else {
      throw new Error("Could not publish changes");
    }
  });

  if (!entityType || !propertyTypes) {
    return null;
  }

  // @todo fix $id on EntityType
  const currentVersion = extractVersion(entityType.$id as any);

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
              onDiscardChanges={() => {
                reset();
              }}
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
                        {router.query["entity-type-id"]}
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
              </Container>
            </Box>
          </Box>
          <Box py={5}>
            <Container>
              <Typography variant="h5" mb={1.25}>
                Properties of{" "}
                <Box component="span" sx={{ fontWeight: "bold" }}>
                  {entityType.title}
                </Box>
              </Typography>
              <PropertyListCard />
            </Container>
          </Box>
        </Box>
      </FormProvider>
    </PropertyTypesContext.Provider>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
