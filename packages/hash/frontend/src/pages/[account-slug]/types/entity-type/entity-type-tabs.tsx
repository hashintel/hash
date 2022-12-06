import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Tabs, tabsClasses } from "@mui/material";
import { useRouter } from "next/router";
import { useContext, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useFontLoadedCallback } from "../../../../components/hooks/useFontLoadedCallback";
import { EntityTypeEditorForm } from "./form-types";
import { TabLink } from "./tab-link";
import { getTabUri, getTabValue, useCurrentTab } from "./use-current-tab";
import { useEntityTypeEntities } from "./use-entity-type-entities";
import { getEntityTypeBaseUri } from "./util";
import { useEntityType } from "./use-entity-type";
import { WorkspaceContext } from "../../../shared/workspace-context";

export const EntityTypeTabs = ({ isDraft }: { isDraft: boolean }) => {
  const router = useRouter();
  const { activeWorkspace } = useContext(WorkspaceContext);

  const entityType = useEntityType();

  const [animateTabs, setAnimateTabs] = useState(false);

  const { control } = useFormContext<EntityTypeEditorForm>();
  const propertiesCount = useWatch({ control, name: "properties.length" });

  const { entities } = useEntityTypeEntities();

  const baseUri = getEntityTypeBaseUri(
    router.query["entity-type-id"] as string,
    router.query["account-slug"] as string,
  );

  const currentTab = useCurrentTab();

  useFontLoadedCallback(
    [
      {
        family: "Open Sauce Two",
        weight: "500",
      },
    ],
    () => setAnimateTabs(true),
  );

  return (
    <Box display="flex">
      <Tabs
        value={router.query.tab ?? ""}
        TabIndicatorProps={{
          sx: ({ palette }) => ({
            height: 3,
            backgroundColor: palette.blue[60],
            minHeight: 0,
            bottom: -1,
            ...(!animateTabs ? { transition: "none" } : {}),
          }),
        }}
        sx={{
          minHeight: 0,
          overflow: "visible",
          alignItems: "flex-end",
          flex: 1,
          [`.${tabsClasses.scroller}`]: {
            overflow: "visible !important",
          },
        }}
      >
        <TabLink
          value={getTabValue("definition")}
          href={isDraft ? router.asPath : getTabUri(baseUri, "definition")}
          label="Definition"
          count={propertiesCount ?? 0}
          active={currentTab === "definition"}
        />
        {isDraft
          ? null
          : /**
             * MUI requires that a component with the value prop is a direct descendant of
             * Tabs, so we need to use an array and not a fragment.
             *
             * @see https://github.com/mui/material-ui/issues/30153
             */
            [
              <TabLink
                key="entities"
                value={getTabValue("entities")}
                href={getTabUri(baseUri, "entities")}
                label="Entities"
                count={entities?.length ?? 0}
                active={currentTab === "entities"}
              />,
              <TabLink
                key="create"
                value="create"
                href={`/@${
                  activeWorkspace?.shortname
                }/new/entity?entity-type-id=${encodeURIComponent(
                  entityType.$id,
                )}`}
                label="Create new entity"
                sx={(theme) => ({
                  ml: "auto",
                  color: "inherit",
                  fill: theme.palette.blue[70],
                  "&:hover": {
                    color: theme.palette.primary.main,
                    fill: theme.palette.blue[60],
                  },
                })}
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
              />,
            ]}
      </Tabs>
    </Box>
  );
};
