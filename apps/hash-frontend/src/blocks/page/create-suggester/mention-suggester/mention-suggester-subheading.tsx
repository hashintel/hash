import {
  ListItem,
  ListItemButton,
  listItemButtonClasses,
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
    disabled?: boolean;
    open?: boolean;
  }
> = ({ children, onClick, chevronDirection = "right", disabled, open }) => {
  const content = (
    <ListItemText
      sx={[
        {
          [`& .${listItemTextClasses.primary}`]: {
            fontSize: 12,
            fontWeight: 600,
            color: ({ palette }) => palette.gray[60],
            textTransform: "uppercase",
          },
          "&:hover": {
            [`& .${listItemTextClasses.primary}`]: {
              color: ({ palette }) => palette.gray[80],
            },
            svg: {
              color: ({ palette }) => palette.gray[80],
            },
          },
        },
      ]}
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
            transition: ({ transitions }) => transitions.create("transform"),
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      ) : null}
    </ListItemText>
  );

  return onClick ? (
    <ListItemButton
      disabled={disabled}
      onClick={onClick}
      sx={{
        paddingBottom: 0,
        transition: ({ transitions }) => transitions.create("color"),
        "&:hover": {
          background: "transparent",
          color: ({ palette }) => palette.gray[80],
        },
        [`${listItemButtonClasses.disabled}`]: {
          opacity: disabled ? 0.6 : 1,
        },
      }}
    >
      {content}
    </ListItemButton>
  ) : (
    <ListItem sx={{ paddingBottom: 0, opacity: disabled ? 0.6 : 1 }}>
      {content}
    </ListItem>
  );
};
