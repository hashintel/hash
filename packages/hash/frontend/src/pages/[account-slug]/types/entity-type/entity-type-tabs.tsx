import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Tabs, tabsClasses } from "@mui/material";
import { useRouter } from "next/router";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";
import { TabButton } from "./tab-button";
import { TabLink } from "./tab-link";
import { useEntityTypeEntities } from "./use-entity-type-entities";
import { getEntityTypeBaseUri } from "./[entity-type-id].page";

export const getTabFromQuery = (query?: string) => {
  if (!query) {
    return "definition";
  }

  return query;
};

export const EntityTypeTabs = () => {
  const router = useRouter();

  const { control } = useFormContext<EntityTypeEditorForm>();
  const propertiesCount = useWatch({ control, name: "properties.length" });

  const { entities } = useEntityTypeEntities() ?? {};

  const baseUri = getEntityTypeBaseUri(
    router.query["account-slug"] as string,
    router.query["entity-type-id"] as string,
  );

  const currentTab = getTabFromQuery(router.query.tab as string);

  return (
    <Box display="flex" overflow="visible">
      <Tabs
        value={router.query.tab ?? ""}
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
        <TabLink
          value=""
          href={baseUri}
          label="Definition"
          count={propertiesCount}
          active={currentTab === "definition"}
        />
        <TabLink
          value="entities"
          href={`${baseUri}?tab=entities`}
          label="Entities"
          count={entities?.length}
          active={currentTab === "entities"}
        />
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
                fill: "inherit",
                ml: 1,
              })}
            />
          }
        />
      </Box>
    </Box>
  );
};
