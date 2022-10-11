import init, { EntityType } from "@blockprotocol/type-system-web";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useBlockProtocolGetEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { FRONTEND_URL } from "../../../../lib/config";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { EmptyPropertyListCard } from "./empty-property-list-card";
import { OntologyChip } from "./ontology-chip";
import { HashOntologyIcon } from "./hash-ontology-icon";
import { PropertyListCard } from "./property-list-card";
import {
  PropertyTypesContext,
  useRemotePropertyTypes,
} from "./use-property-types";
import { useStateCallback } from "./util";

const useEntityType = (entityTypeSlug: string) => {
  const { getEntityType } = useBlockProtocolGetEntityType();
  const [entityType, setEntityType] = useState<EntityType | null>(null);

  useEffect(() => {
    void getEntityType({
      // @todo get latest version somehow?
      data: { entityTypeId: `${FRONTEND_URL}${entityTypeSlug}/v/1` },
    }).then((value) => {
      if (value.data) {
        setEntityType(value.data.entityType);
      }
    });
  }, [getEntityType, entityTypeSlug]);

  return entityType;
};

const Page: NextPageWithLayout = () => {
  const [mode, setMode] = useStateCallback<"empty" | "list">("empty");
  const insertFieldRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const entityType = useEntityType(router.asPath);
  const propertyTypes = useRemotePropertyTypes();

  const loadingTypeSystem = useInitTypeSystem();

  if (!entityType || loadingTypeSystem) {
    return null;
  }

  return (
    <PropertyTypesContext.Provider value={propertyTypes}>
      <Box
        component={Stack}
        sx={(theme) => ({
          minHeight: "100vh",
          background: theme.palette.gray[10],
        })}
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
            {mode === "empty" ? (
              <EmptyPropertyListCard
                onClick={() => {
                  setMode("list", () => {
                    insertFieldRef.current?.focus();
                  });
                }}
              />
            ) : (
              <PropertyListCard
                insertFieldRef={insertFieldRef}
                onCancel={() => {
                  setMode("empty");
                }}
              />
            )}
          </Container>
        </Box>
      </Box>
    </PropertyTypesContext.Provider>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
