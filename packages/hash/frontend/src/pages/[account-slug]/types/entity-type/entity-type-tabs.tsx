import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Tabs, tabsClasses } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { EntityTypeDefinitionTab } from "./entity-type-definition-tab";
import { EntityTypeEntitiesTab } from "./entity-type-entities-tab";
import { TabButton } from "./tab-button";

export const EntityTypeTabs = () => {
  const router = useRouter();

  const baseUri = useMemo(
    () =>
      `/${router.query["account-slug"]}/types/entity-type/${router.query["entity-type-id"]}`,
    [router.query],
  );

  return (
    <Box display="flex" overflow="visible">
      <Tabs
        value={router.asPath}
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
