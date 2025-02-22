import type { VersionedUrl } from "@blockprotocol/type-system";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { useRouter } from "next/router";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { TabLink } from "../../../shared/ui/tab-link";
import { Tabs } from "../../../shared/ui/tabs";
import { useEntityType } from "./shared/entity-type-context";
import { useSlideStack } from "../slide-stack";

const defaultTab = "definition";

type EntityTypeTab = "definition" | "entities" | "upload" | "create";

interface EntityTypeTabContextValue {
  tab: EntityTypeTab;
  setTab: (tab: EntityTypeTab) => void;
}

const EntityTypeTabContext = createContext<EntityTypeTabContextValue | null>(
  null,
);

export const EntityTypeTabProvider = ({
  children,
  isInSlide,
}: PropsWithChildren<{ isInSlide: boolean }>) => {
  const router = useRouter();
  const routerTab =
    (router.query.tab as EntityTypeTab | undefined) ?? defaultTab;

  const [tab, setTab] = useState<EntityTypeTab>(
    isInSlide ? defaultTab : routerTab,
  );

  useEffect(() => {
    if (isInSlide) {
      return;
    }

    if (tab !== routerTab) {
      setTab(routerTab);
    }
  }, [tab, isInSlide, routerTab]);

  const contextValue = useMemo(() => ({ tab, setTab }), [tab, setTab]);

  return (
    <EntityTypeTabContext.Provider value={contextValue}>
      {children}
    </EntityTypeTabContext.Provider>
  );
};

export const useEntityTypeTab = () => {
  const context = useContext(EntityTypeTabContext);
  if (!context) {
    throw new Error(
      "useEntityTypeTab must be used within an EntityTypeTabProvider",
    );
  }
  return context;
};

export const getTabUrl = (tab: string, entityTypeId: VersionedUrl) => {
  const pathWithoutParams = generateLinkParameters(entityTypeId).href;

  return tab === defaultTab
    ? pathWithoutParams
    : `${pathWithoutParams}?tab=${encodeURIComponent(tab)}`;
};

export const EntityTypeTabs = ({
  canCreateEntity,
  isDraft,
  isFile,
  isImage,
  isInSlide,
}: {
  canCreateEntity: boolean;
  isDraft: boolean;
  isFile: boolean;
  isImage: boolean;
  isInSlide: boolean;
}) => {
  const router = useRouter();
  const { tab, setTab } = useEntityTypeTab();
  const entityType = useEntityType();
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();
  const isLinkEntityType = isSpecialEntityTypeLookup?.[entityType.$id]?.isLink;

  const { closeSlideStack } = useSlideStack();

  return (
    <Box display="flex">
      <Tabs value={tab}>
        <TabLink
          value="definition"
          href={
            isDraft ? router.asPath : getTabUrl("definition", entityType.$id)
          }
          onClick={
            isInSlide
              ? (event) => {
                  event.preventDefault();
                  setTab("definition");
                }
              : undefined
          }
          label="Definition"
          active={tab === "definition"}
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
                value="entities"
                href={getTabUrl("entities", entityType.$id)}
                onClick={
                  isInSlide
                    ? (event) => {
                        event.preventDefault();
                        setTab("entities");
                      }
                    : undefined
                }
                label="Entities"
                active={tab === "entities"}
              />,
              isLinkEntityType ? (
                []
              ) : canCreateEntity ? (
                <TabLink
                  key={isFile ? "upload" : "create"}
                  value={isFile ? "upload" : "create"}
                  href={
                    isFile
                      ? getTabUrl("upload", entityType.$id)
                      : `/new/entity?entity-type-id=${encodeURIComponent(
                          entityType.$id,
                        )}`
                  }
                  onClick={() => {
                    closeSlideStack();
                  }}
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
