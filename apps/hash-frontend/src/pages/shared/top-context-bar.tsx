import type {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
} from "@blockprotocol/type-system";
import { faCheck, faFile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SxProps, Theme } from "@mui/material";
import {
  Box,
  Collapse,
  FormControlLabel,
  Switch,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import type { FunctionComponent, ReactElement, ReactNode } from "react";
import { useMemo, useState } from "react";

import { isItemArchived } from "../../shared/is-archived";
import { isEntityPageEntity } from "../../shared/is-of-type";
import { useSidebarContext } from "../../shared/layout/layout-with-sidebar";
import type { MenuItemProps } from "../../shared/ui/menu-item";
import type { BreadcrumbsProps } from "./breadcrumbs";
import { Breadcrumbs } from "./breadcrumbs";
import { ArchivedItemBanner } from "./top-context-bar/archived-item-banner";
import { ContextBarActionsDropdown } from "./top-context-bar/context-bar-actions-dropdown";
import { isItemType } from "./top-context-bar/util";

export { useContextBarActionsContext } from "./top-context-bar/context-bar-actions-context";
export { isItemType as isItemEntityType };

const PageRestoredMessageWrapper: FunctionComponent<{
  children: ReactNode;
}> = ({ children }) => (
  <Box
    sx={({ palette }) => ({
      "@keyframes fadeInOut": {
        "0%": {
          opacity: 0,
          background: palette.lime[80],
          borderColor: palette.lime[80],
          color: palette.common.white,
        },
        "5%": {
          opacity: 1,
          background: palette.lime[80],
          borderColor: palette.lime[80],
          color: palette.common.white,
        },
        "10%": {
          background: palette.lime[10],
          borderColor: palette.lime[50],
          color: palette.common.black,
        },
        "80%": { opacity: 1 },
        "100%": { opacity: 0 },
      },
      background: palette.lime[10],
      borderColor: palette.lime[50],
      display: "flex",
      alignItems: "center",
      gap: 1,
      borderWidth: 1,
      borderStyle: "solid",
      borderRadius: "4px",
      paddingY: 0.5,
      paddingX: 1.5,
      animationName: "fadeInOut",
      animationTimingFunction: "linear",
      animationDuration: "5s",
      animationFillMode: "forwards",
    })}
  >
    <FontAwesomeIcon
      icon={faCheck}
      sx={({ palette }) => ({
        fontSize: 14,
        "@keyframes svgFadeInOut": {
          "0%": {
            color: palette.common.white,
          },
          "5%": {
            color: palette.common.white,
          },
          "10%": {
            color: palette.lime[70],
          },
          "80%": {},
          "100%": { color: palette.lime[70] },
        },
        animationName: "svgFadeInOut",
        animationTimingFunction: "linear",
        animationDuration: "5s",
        animationFillMode: "forwards",
      })}
    />
    <Typography variant="smallTextParagraphs" sx={{ fontWeight: 500 }}>
      {children}
    </Typography>
  </Box>
);

export const TOP_CONTEXT_BAR_HEIGHT = 50;

type TopContextBarProps = {
  actionMenuItems?: ReactElement<MenuItemProps>[];
  breadcrumbsEndAdornment?: ReactNode;
  crumbs: BreadcrumbsProps["crumbs"];
  defaultCrumbIcon?: ReactNode;
  item?: Entity | EntityTypeWithMetadata | DataTypeWithMetadata;
  onItemUnarchived?: () => void;
  scrollToTop?: () => void;
  sx?: SxProps<Theme>;
};

export const TopContextBar = ({
  actionMenuItems,
  breadcrumbsEndAdornment,
  crumbs,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
  onItemUnarchived,
  item,
  scrollToTop = () => {},
  sx = [],
}: TopContextBarProps) => {
  const [displayRestoredMessage, setDisplayRestoredMessage] = useState(false);

  const { sidebarOpen } = useSidebarContext();

  const { replace, query } = useRouter();

  const isCanvasPage =
    item &&
    "entityTypeIds" in item.metadata &&
    item.metadata.entityTypeIds.includes(systemEntityTypes.canvas.entityTypeId);

  // @todo make 'additional buttons' a prop and move this to the page page
  const setCanvasLockState = (shouldLock: boolean) => {
    const { locked: __, ...otherParams } = query;
    void replace({ query: { ...otherParams, locked: shouldLock } }, undefined, {
      shallow: true,
    });
  };

  // @todo make 'additional banner' a prop and move this logic to the (1) page page and (2) entity type pages
  const archived = useMemo(() => {
    if (!item) {
      return false;
    }

    return isItemArchived(item);
  }, [item]);

  return (
    <>
      <Box
        sx={[
          ({ palette }) => ({
            background: palette.common.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: TOP_CONTEXT_BAR_HEIGHT,
            pl: sidebarOpen ? 3 : 8,
            pr: 4,
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <Box display="flex" gap={1}>
          <Breadcrumbs
            crumbs={crumbs}
            defaultIcon={defaultCrumbIcon}
            scrollToTop={scrollToTop}
          />
          {item && displayRestoredMessage ? (
            <PageRestoredMessageWrapper>{`${
              isItemType(item)
                ? "Type"
                : isEntityPageEntity(item)
                  ? "Page"
                  : "Entity"
            } restored!`}</PageRestoredMessageWrapper>
          ) : null}
          {breadcrumbsEndAdornment}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {/*
           * @todo: bring back draft entity viewers when the GQL resolver
           * returns the correct number of authorization relationships.
           *
           * @see https://linear.app/hash/issue/H-1115/use-permission-types-from-graph-in-graphql
           */}
          {/* {item && !isItemType(item) && !isEntityPageEntity(item) && (
            <ShareDropdownMenu entity={item} />
          )} */}

          {actionMenuItems?.length ? (
            <ContextBarActionsDropdown>
              {actionMenuItems}
            </ContextBarActionsDropdown>
          ) : null}
          {isCanvasPage && (
            <FormControlLabel
              labelPlacement="start"
              slotProps={{
                typography: { fontSize: 14, fontWeight: 500, marginRight: 1 },
              }}
              sx={{
                mr: 2,
              }}
              control={
                <Switch
                  checked={!!query.locked}
                  onChange={() => setCanvasLockState(!query.locked)}
                  inputProps={{ "aria-label": "controlled" }}
                  size="medium"
                />
              }
              label="Locked"
            />
          )}
        </Box>
      </Box>
      {item ? (
        <Collapse in={archived}>
          <ArchivedItemBanner
            item={item}
            onUnarchived={() => {
              setDisplayRestoredMessage(true);
              setTimeout(() => {
                setDisplayRestoredMessage(false);
              }, 5000);
              onItemUnarchived?.();
            }}
          />
        </Collapse>
      ) : null}
    </>
  );
};
