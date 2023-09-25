import { AsteriskRegularIcon, IconButton } from "@hashintel/design-system";
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
  ListItemButton,
  ListItemButtonProps,
  ListItemIcon,
  ListItemText as MuiListItemText,
  listItemTextClasses,
  Popper,
  styled,
  Typography,
} from "@mui/material";
import { forwardRef, useEffect, useRef } from "react";

import { generateEntityLabel } from "../../../../lib/entities";
import { ChevronRightRegularIcon } from "../../../../shared/icons/chevron-right-regular-icon";
import { MentionSuggesterSubheading } from "./mention-suggester-subheading";
import { MentionSuggesterWrapper } from "./mention-suggester-wrapper";

const ListItemPrimaryText = styled(MuiListItemText)(({ theme }) => ({
  [`& .${listItemTextClasses.primary}`]: {
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.gray[90],
    lineHeight: "18px",
  },
}));

const ListItemSecondaryText = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  color: theme.palette.gray[50],
  fontWeight: 500,
  lineHeight: "18px",
}));

export type SubMenuItem = {
  kind: "property";
  propertyType: PropertyTypeWithMetadata;
  propertyValue: EntityPropertyValue;
};

export const MentionSuggesterEntity = forwardRef<
  HTMLDivElement,
  {
    entitiesSubgraph: Subgraph<EntityRootType>;
    entityType: EntityTypeWithMetadata;
    entity: Entity;
    displayTypeTitle?: boolean;
    displaySubMenu: boolean;
    subMenuIndex: number;
    subMenuItems: SubMenuItem[];
    setDisplaySubMenu: (displaySubMenu: boolean) => void;
  } & ListItemButtonProps
>(
  (
    {
      entitiesSubgraph,
      entity,
      displayTypeTitle = false,
      entityType,
      displaySubMenu,
      subMenuIndex,
      subMenuItems,
      setDisplaySubMenu,
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

    return (
      <>
        <ListItemButton ref={buttonRef} {...listItemButtonProps}>
          <ListItemIcon sx={{ minWidth: "unset" }}>
            <AsteriskRegularIcon />
          </ListItemIcon>
          <ListItemPrimaryText>
            {generateEntityLabel(entitiesSubgraph, entity)}
          </ListItemPrimaryText>
          <Box display="flex" alignItems="center" gap={1}>
            {displayTypeTitle ? (
              <ListItemSecondaryText>
                {entityType.schema.title}
              </ListItemSecondaryText>
            ) : null}
            <Box>
              <IconButton
                onClick={() => setDisplaySubMenu(true)}
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
            <MentionSuggesterSubheading>Values</MentionSuggesterSubheading>
            {subMenuItems.map(({ propertyType, propertyValue }, index) => (
              <ListItemButton
                key={propertyType.metadata.recordId.baseUrl}
                selected={index === subMenuIndex}
              >
                <ListItemIcon sx={{ minWidth: "unset" }}>
                  <AsteriskRegularIcon />
                </ListItemIcon>
                <ListItemPrimaryText
                  sx={{
                    flexShrink: 0,
                  }}
                >
                  {propertyType.schema.title}
                </ListItemPrimaryText>
                <ListItemSecondaryText
                  sx={{
                    marginLeft: 4,
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  {propertyValue?.toString()}
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
