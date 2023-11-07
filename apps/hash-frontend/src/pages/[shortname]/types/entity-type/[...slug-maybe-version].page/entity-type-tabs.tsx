import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { useRouter } from "next/router";

import { useEntityTypeEntities } from "../../../../../shared/entity-type-entities-context";
import { TabLink } from "../../../../../shared/ui/tab-link";
import { Tabs } from "../../../../../shared/ui/tabs";
import { useEntityType } from "./shared/entity-type-context";
import { getEntityTypeBaseUrl } from "./shared/get-entity-type-base-url";
import { getTabUrl, getTabValue, useCurrentTab } from "./shared/tabs";

export const EntityTypeTabs = ({
  isDraft,
  isFile,
  isImage,
}: {
  isDraft: boolean;
  isFile: boolean;
  isImage: boolean;
}) => {
  const router = useRouter();

  const entityType = useEntityType();

  const { entities, loading } = useEntityTypeEntities();

  const baseUrl = getEntityTypeBaseUrl(
    router.query["slug-maybe-version"]![0] as string,
    router.query.shortname as `@${string}`,
  );

  const currentTab = useCurrentTab();

  return (
    <Box display="flex">
      <Tabs value={router.query.tab ?? ""}>
        <TabLink
          value={getTabValue("definition")}
          href={isDraft ? router.asPath : getTabUrl(baseUrl, "definition")}
          label="Definition"
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
                href={getTabUrl(baseUrl, "entities")}
                label="Entities"
                loading={loading}
                count={entities?.length ?? 0}
                active={currentTab === "entities"}
              />,
              <TabLink
                key={isFile ? "upload" : "create"}
                value={isFile ? "upload" : "create"}
                href={
                  isFile
                    ? getTabUrl(baseUrl, "upload")
                    : `/new/entity?entity-type-id=${encodeURIComponent(
                        entityType.$id,
                      )}`
                }
                label={
                  isFile
                    ? `Add new ${isImage ? "image" : "file"}`
                    : "Create new entity"
                }
                sx={(theme) => ({
                  ml: "auto",
                  color: "inherit",
                  fill: theme.palette.blue[70],
                  "&:hover": {
                    color: theme.palette.primary.main,
                    fill: theme.palette.blue[60],
                  },
                  mr: 0,
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
