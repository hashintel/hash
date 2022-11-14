import { extractBaseUri, VersionedUri } from "@blockprotocol/type-system-web";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { frontendUrl } from "@hashintel/hash-shared/environment";
import { Box, Tabs, tabsClasses } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { EntityTypeDefinitionTab } from "./entity-type-definition-tab";
import { EntityTypeEntitiesTab } from "./entity-type-entities-tab";
import { TabButton } from "./tab-button";
import { useEntityType } from "./use-entity-type";

export const EntityTypeTabs = () => {
  const router = useRouter();
  const entityType = useEntityType();

  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);

  useEffect(() => {
    setActiveTab(`${frontendUrl}${router.asPath}`);
  }, [router.asPath]);

  const baseUri = useMemo(() => {
    if (entityType?.$id) {
      const entityTypeBaseUri = extractBaseUri(entityType.$id as VersionedUri);
      return entityTypeBaseUri.substring(0, entityTypeBaseUri.length - 1);
    }
  }, [entityType]);

  if (!baseUri) {
    return null;
  }

  return (
    <Box display="flex" overflow="visible">
      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        TabIndicatorProps={{
          sx: ({ palette }) => ({
            height: 3,
            backgroundColor: palette.blue[60],
            minHeight: 0,
            bottom: -1,
          }),
        }}
        sx={{
          minHeight: 0,
          overflow: "visible",
          alignItems: "flex-end",
          [`.${tabsClasses.scroller}`]: {
            overflow: "visible !important",
          },
        }}
      >
        <EntityTypeDefinitionTab value={baseUri} />
        <EntityTypeEntitiesTab value={`${baseUri}/entities`} />
      </Tabs>

      <Box display="flex" ml="auto">
        <TabButton
          href="#"
          label="Create new entity"
          icon={
            <FontAwesomeIcon
              icon={faPlus}
              sx={(theme) => ({
                ...theme.typography.smallTextLabels,
                color: theme.palette.blue[60],
                ml: 1,
              })}
            />
          }
        />
      </Box>
    </Box>
  );
};
