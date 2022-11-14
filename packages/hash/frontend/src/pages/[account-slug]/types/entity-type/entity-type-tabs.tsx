import { extractBaseUri, VersionedUri } from "@blockprotocol/type-system-web";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { FRONTEND_URL } from "../../../../lib/config";
import { EntityTypeDefinitionTab } from "./entity-type-definition-tab";
import { EntityTypeEntitiesTab } from "./entity-type-entities-tab";
import { TestTab } from "./tab-button";
import { TabButton } from "./tab-button";
import { useEntityType } from "./use-entity-type";

export const EntityTypeTabs = () => {
  const router = useRouter();
  const entityType = useEntityType();

  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);

  useEffect(() => {
    setActiveTab(`${FRONTEND_URL}${router.asPath}`);
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
    <Box display="flex">
      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        TabIndicatorProps={{
          sx: ({ palette }) => ({
            height: 3,
            backgroundColor: palette.blue[60],
            minHeight: 0,
          }),
        }}
      >
        <EntityTypeDefinitionTab value={baseUri} />
        <EntityTypeEntitiesTab value={`${baseUri}/entities`} />
      </Tabs>

      <Box display="flex" ml="auto">
        {/* <TabButton
          value="#"
          sx={(theme) => ({ color: theme.palette.gray[90] })}
        >
          <Typography variant="smallTextLabels" sx={{ fontWeight: 500 }}>
            Create new entity
          </Typography>
          <FontAwesomeIcon
            icon={faPlus}
            sx={(theme) => ({
              ...theme.typography.smallTextLabels,
              color: theme.palette.blue[70],
              ml: 1,
            })}
          />
        </TabButton> */}
        <TabButton value="#" label="Create new entity" />
      </Box>
    </Box>
  );
};
