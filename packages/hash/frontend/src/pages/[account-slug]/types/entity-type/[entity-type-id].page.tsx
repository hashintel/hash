import {
  EntityType,
  extractBaseUri,
  extractVersion,
} from "@blockprotocol/type-system-web";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Typography } from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo } from "react";
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
import { mustBeVersionedUri } from "./util";

const getBaseUri = (path: string) => {
  const url = new URL(path, FRONTEND_URL);

  return `${FRONTEND_URL}${url.pathname}/`;
};

// @todo loading state
const Page: NextPageWithLayout = () => {
  const router = useRouter();
  // @todo how to handle remote types
  const isDraft = !!router.query.draft;
  const baseEntityTypeUri = isDraft ? null : getBaseUri(router.asPath);

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
    (fetchedEntityType) => {
      reset({
        properties: Object.values(fetchedEntityType.properties).map((ref) => {
          if ("type" in ref) {
            // @todo handle property arrays
            throw new Error("handle property arrays");
          }
          return { $id: mustBeVersionedUri(ref.$ref) };
        }),
      });
    },
  );

  const entityType = remoteEntityType ?? draftEntityType;

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

    if (isDraft) {
      if (!draftEntityType) {
        throw new Error("Cannot publish without draft");
      }

      await publishDraft({
        ...draftEntityType,
        properties,
      });
      reset(data);
    } else {
      const res = await updateEntityType({
        properties,
      });

      if (!res.errors?.length) {
        reset(data);
      } else {
        throw new Error("Could not publish changes");
      }
    }
  });

  if (!entityType) {
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
