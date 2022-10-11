import { EntityType, PropertyType } from "@blockprotocol/type-system-web";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBlockProtocolGetEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { FRONTEND_URL } from "../../../../lib/config";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { EditBar } from "./edit-bar";
import { HashOntologyIcon } from "./hash-ontology-icon";
import { OntologyChip } from "./ontology-chip";
import { PropertyListCard } from "./property-list-card";
import {
  PropertyTypesContext,
  useRemotePropertyTypes,
} from "./use-property-types";

const useEntityType = (entityTypeId: string, onCompleted?: () => void) => {
  const { getEntityType } = useBlockProtocolGetEntityType();
  const [entityType, setEntityType] = useState<EntityType | null>(null);

  const onCompletedRef = useRef(onCompleted);

  useLayoutEffect(() => {
    onCompletedRef.current = onCompleted;
  });

  useEffect(() => {
    void getEntityType({
      data: { entityTypeId },
    }).then((value) => {
      if (value.data) {
        setEntityType(value.data.entityType);
        onCompletedRef.current?.();
      }
    });
  }, [getEntityType, entityTypeId]);

  return entityType;
};

// @todo loading state
const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const [insertedPropertyTypes, setInsertedPropertyTypes] = useState<
    PropertyType[]
  >([]);
  const [removedPropertyTypes, setRemovedPropertyTypes] = useState<
    PropertyType[]
  >([]);

  // @todo find this out somehow
  const currentVersion = 1;
  const entityTypeId = `${FRONTEND_URL}/${router.query["account-slug"]}/types/entity-type/${router.query["entity-type-id"]}/v/${currentVersion}`;

  const entityType = useEntityType(entityTypeId, () => {
    setInsertedPropertyTypes([]);
    setRemovedPropertyTypes([]);
  });

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
          <EditBar currentVersion={currentVersion} />
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
            <PropertyListCard
              propertyTypes={insertedPropertyTypes}
              onRemovePropertyType={(propertyType) => {
                if (insertedPropertyTypes.includes(propertyType)) {
                  const nextInsertedPropertyTypes =
                    insertedPropertyTypes.filter(
                      (type) => type !== propertyType,
                    );
                  setInsertedPropertyTypes(nextInsertedPropertyTypes);
                } else if (!removedPropertyTypes.includes(propertyType)) {
                  setRemovedPropertyTypes([
                    ...removedPropertyTypes,
                    propertyType,
                  ]);
                }
              }}
              onAddPropertyType={(propertyType) => {
                if (!insertedPropertyTypes.includes(propertyType)) {
                  setInsertedPropertyTypes([
                    ...insertedPropertyTypes,
                    propertyType,
                  ]);
                }
              }}
            />
          </Container>
        </Box>
      </Box>
    </PropertyTypesContext.Provider>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
