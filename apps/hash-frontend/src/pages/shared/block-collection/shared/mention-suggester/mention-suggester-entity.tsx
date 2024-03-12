import { AsteriskRegularIcon, IconButton } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityPropertyValue,
  EntityRootType,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import {
  Box,
  ListItemButton as MuiListItemButton,
  listItemButtonClasses,
  ListItemButtonProps,
  ListItemIcon,
  ListItemText as MuiListItemText,
  listItemTextClasses,
  Popper,
  styled,
  Typography,
} from "@mui/material";
import { forwardRef, useEffect, useRef } from "react";

import { ArrowDownArrowUpRegularIcon } from "../../../../../shared/icons/arrow-down-arrow-up-regular-icon";
import { ChevronRightRegularIcon } from "../../../../../shared/icons/chevron-right-regular-icon";
import { LinkRegularIcon } from "../../../../../shared/icons/link-regular-icon";
import { Button } from "../../../../../shared/ui";
import { useEntityIcon } from "../../../../../shared/use-entity-icon";
import { MentionSuggesterSubheading } from "./mention-suggester-subheading";
import { MentionSuggesterWrapper } from "./mention-suggester-wrapper";

export type SortOrder = "asc" | "desc";

const ListItemButton = styled(MuiListItemButton)(({ theme }) => ({
  [`&.${listItemButtonClasses.disabled}`]: {
    opacity: 0.6,
  },
  borderRadius: "8px",
  [`&.${listItemButtonClasses.selected}`]: {
    background: theme.palette.gray[20],
  },
}));

const ListItemPrimaryText = styled(MuiListItemText)(({ theme }) => ({
  [`& .${listItemTextClasses.primary}`]: {
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.gray[90],
    lineHeight: "18px",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
}));

const ListItemSecondaryText = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  color: theme.palette.gray[50],
  fontWeight: 500,
  lineHeight: "18px",
  textAlign: "right",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
}));

export type SubMenuItem =
  | {
      kind: "property";
      propertyType: PropertyTypeWithMetadata;
      propertyValue: EntityPropertyValue;
    }
  | {
      kind: "outgoing-link";
      linkEntity: Entity;
      linkEntityType: EntityTypeWithMetadata;
      targetEntity?: Entity;
      targetEntityLabel?: string;
    };

export const MentionSuggesterEntity = forwardRef<
  HTMLDivElement,
  {
    sortOrder: SortOrder;
    setSortOrder: (sortOrder: SortOrder) => void;
    entitiesSubgraph: Subgraph<EntityRootType>;
    entityType: EntityTypeWithMetadata;
    entity: Entity;
    displayTypeTitle?: boolean;
    displaySubMenu: boolean;
    subMenuIndex: number;
    subMenuItems: SubMenuItem[];
    setDisplaySubMenu: (displaySubMenu: boolean) => void;
    onSubMenuClick: (subMenuIndex: number) => void;
  } & ListItemButtonProps
>(
  (
    {
      sortOrder,
      setSortOrder,
      entitiesSubgraph,
      entity,
      displayTypeTitle = false,
      entityType,
      displaySubMenu,
      subMenuIndex,
      subMenuItems,
      setDisplaySubMenu,
      onSubMenuClick,
      ...listItemButtonProps
    },
    ref,
  ) => {
    const buttonRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (typeof ref === "function") {
        ref(buttonRef.current);
      } else if (ref) {
        // eslint-disable-next-line no-param-reassign
        ref.current = buttonRef.current;
      }
    }, [ref]);

    const entityIcon = useEntityIcon({ entity, entityType });

    return (
      <>
        <ListItemButton ref={buttonRef} {...listItemButtonProps}>
          <ListItemIcon sx={{ minWidth: "unset" }}>{entityIcon}</ListItemIcon>
          <ListItemPrimaryText>
            {generateEntityLabel(entitiesSubgraph, entity)}
          </ListItemPrimaryText>
          <Box display="flex" alignItems="center" gap={1}>
            {displayTypeTitle ? (
              <ListItemSecondaryText sx={{ marginLeft: 2 }}>
                {entityType.schema.title}
              </ListItemSecondaryText>
            ) : null}
            <Box>
              <IconButton
                onClick={(event) => {
                  event.stopPropagation();
                  setDisplaySubMenu(true);
                }}
                sx={{
                  opacity: subMenuItems.length > 0 ? 1 : 0,
                  borderRadius: "4px",
                  p: 0.25,
                  background: ({ palette }) =>
                    displaySubMenu ? palette.gray[50] : undefined,
                  "&:hover": {
                    background: ({ palette }) => palette.gray[40],
                    "> svg": {
                      color: ({ palette }) => palette.common.white,
                    },
                  },
                  "> svg": {
                    fontSize: 12,
                    color: ({ palette }) =>
                      displaySubMenu ? palette.common.white : palette.gray[50],
                  },
                }}
              >
                <ChevronRightRegularIcon />
              </IconButton>
            </Box>
          </Box>
        </ListItemButton>
        <Popper
          sx={{
            zIndex: 2500,
          }}
          open={displaySubMenu}
          anchorEl={buttonRef.current}
          placement="right-start"
          popperOptions={{
            modifiers: [
              {
                name: "offset",
                options: {
                  offset: [-34, -8],
                },
              },
            ],
          }}
        >
          <MentionSuggesterWrapper>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                my: 0.5,
              }}
            >
              <MentionSuggesterSubheading>Values</MentionSuggesterSubheading>
              <Button
                variant="tertiary"
                onClick={() =>
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                }
                sx={{
                  flexShrink: 0,
                  color: ({ palette }) => palette.gray[50],
                  background: ({ palette }) => palette.gray[10],
                  fontSize: 13,
                  px: 1,
                  py: 0,
                  minHeight: "unset",
                  height: "fit-content",
                  borderWidth: 0,
                }}
                endIcon={<ArrowDownArrowUpRegularIcon />}
              >
                {sortOrder === "asc"
                  ? "Alphabetical (A-Z)"
                  : "Reverse Alphabetical (Z-A)"}
              </Button>
            </Box>
            {subMenuItems.map((item, index) => (
              <ListItemButton
                key={
                  item.kind === "outgoing-link"
                    ? item.linkEntity.metadata.recordId.entityId
                    : item.propertyType.metadata.recordId.baseUrl
                }
                onClick={() => onSubMenuClick(index)}
                selected={index === subMenuIndex}
              >
                <ListItemIcon sx={{ minWidth: "unset" }}>
                  {item.kind === "outgoing-link" ? (
                    <LinkRegularIcon />
                  ) : (
                    <AsteriskRegularIcon />
                  )}
                </ListItemIcon>
                <ListItemPrimaryText
                  sx={{
                    flexShrink: 0,
                  }}
                >
                  {item.kind === "outgoing-link"
                    ? item.linkEntityType.schema.title
                    : item.propertyType.schema.title}
                </ListItemPrimaryText>
                <ListItemSecondaryText
                  sx={{
                    marginLeft: 4,
                  }}
                >
                  {item.kind === "outgoing-link"
                    ? item.targetEntityLabel
                    : item.propertyValue?.toString()}
                </ListItemSecondaryText>
              </ListItemButton>
            ))}
            <MentionSuggesterSubheading
              onClick={() => setDisplaySubMenu(false)}
              chevronDirection="left"
            >
              Back to Results
            </MentionSuggesterSubheading>
          </MentionSuggesterWrapper>
        </Popper>
      </>
    );
  },
);
