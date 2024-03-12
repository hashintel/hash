import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { useRouter } from "next/router";

import { useEntityTypeEntitiesContext } from "../../../shared/entity-type-entities-context";
import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { TabLink } from "../../../shared/ui/tab-link";
import { Tabs } from "../../../shared/ui/tabs";
import { useEntityType } from "./shared/entity-type-context";
import { getTabUrl, getTabValue, useCurrentTab } from "./shared/tabs";

export const EntityTypeTabs = ({
  canCreateEntity,
  isDraft,
  isFile,
  isImage,
}: {
  canCreateEntity: boolean;
  isDraft: boolean;
  isFile: boolean;
  isImage: boolean;
}) => {
  const router = useRouter();

  const entityType = useEntityType();

  const { entities, loading } = useEntityTypeEntitiesContext();

  const currentTab = useCurrentTab();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isLinkEntityType = isSpecialEntityTypeLookup?.[entityType.$id]?.isLink;

  return (
    <Box display="flex">
      <Tabs value={router.query.tab ?? ""}>
        <TabLink
          value={getTabValue("definition")}
          href={isDraft ? router.asPath : getTabUrl("definition")}
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
                href={getTabUrl("entities")}
                label="Entities"
                loading={loading}
                count={entities?.length ?? 0}
                active={currentTab === "entities"}
              />,
              isLinkEntityType ? (
                []
              ) : canCreateEntity ? (
                <TabLink
                  key={isFile ? "upload" : "create"}
                  value={isFile ? "upload" : "create"}
                  href={
                    isFile
                      ? getTabUrl("upload")
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
                />
              ) : null,
            ].flat()}
      </Tabs>
    </Box>
  );
};
