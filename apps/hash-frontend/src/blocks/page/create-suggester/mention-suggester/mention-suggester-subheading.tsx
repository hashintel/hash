import {
  ListItem,
  ListItemButton,
  ListItemText,
  listItemTextClasses,
} from "@mui/material";
import { FunctionComponent, PropsWithChildren } from "react";

import { ChevronLeftRegularIcon } from "../../../../shared/icons/chevron-left-regular-icon";
import { ChevronRightRegularIcon } from "../../../../shared/icons/chevron-right-regular-icon";

export const MentionSuggesterSubheading: FunctionComponent<
  PropsWithChildren & {
    onClick?: () => void;
    chevronDirection?: "right" | "left";
  }
> = ({ children, onClick, chevronDirection = "right" }) => {
  const content = (
    <ListItemText
      sx={{
        [`& .${listItemTextClasses.primary}`]: {
          fontSize: 12,
          fontWeight: 600,
          color: ({ palette }) => palette.gray[60],
          textTransform: "uppercase",
        },
        "&:hover svg": {
          "&.chevron-left": {
            right: 4,
          },
          "&.chevron-right": {
            left: 4,
          },
        },
      }}
    >
      {onClick && chevronDirection === "left" ? (
        <ChevronLeftRegularIcon
          className="chevron-left"
          sx={{
            fontSize: 12,
            position: "relative",
            right: 0,
            top: 1,
            marginRight: 1,
            transition: ({ transitions }) => transitions.create("right"),
          }}
        />
      ) : null}
      {children}
      {onClick && chevronDirection === "right" ? (
        <ChevronRightRegularIcon
          className="chevron-right"
          sx={{
            fontSize: 12,
            position: "relative",
            top: 1,
            left: 0,
            marginLeft: 1,
            transition: ({ transitions }) => transitions.create("left"),
          }}
        />
      ) : null}
    </ListItemText>
  );

  return onClick ? (
    <ListItemButton
      onClick={onClick}
      sx={{
        paddingBottom: 0,
        transition: ({ transitions }) => transitions.create("color"),
        "&:hover": {
          background: "transparent",
          color: ({ palette }) => palette.gray[80],
        },
      }}
    >
      {content}
    </ListItemButton>
  ) : (
    <ListItem sx={{ paddingBottom: 0 }}>{content}</ListItem>
  );
};
