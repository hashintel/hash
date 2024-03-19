import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { BoxProps } from "@mui/material";
import {
  ListItem,
  ListItemButton,
  listItemButtonClasses,
  ListItemText,
  listItemTextClasses,
} from "@mui/material";
import type { FunctionComponent, PropsWithChildren } from "react";

export const MentionSuggesterSubheading: FunctionComponent<
  PropsWithChildren & {
    onClick?: () => void;
    chevronDirection?: "right" | "left";
    disabled?: boolean;
    open?: boolean;
    sx?: BoxProps["sx"];
  }
> = ({ children, onClick, chevronDirection = "right", disabled, open, sx }) => {
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
          svg: {
            fontSize: 10,
            position: "relative",
            top: 0,
          },
          ...(onClick
            ? {
                "&:hover": {
                  [`& .${listItemTextClasses.primary}`]: {
                    color: ({ palette }) => palette.gray[80],
                  },
                  svg: {
                    color: ({ palette }) => palette.gray[80],
                  },
                },
              }
            : {}),
        },
      ]}
    >
      {onClick && chevronDirection === "left" ? (
        <FontAwesomeIcon
          icon={faChevronLeft}
          className="chevron-left"
          sx={{
            right: 0,
            marginRight: 0.75,
            transition: ({ transitions }) => transitions.create("right"),
          }}
        />
      ) : null}
      {children}
      {onClick && chevronDirection === "right" ? (
        <FontAwesomeIcon
          icon={faChevronRight}
          className="chevron-right"
          sx={{
            left: 0,
            marginLeft: 0.75,
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
      sx={[
        {
          paddingBottom: 0,
          transition: ({ transitions }) => transitions.create("color"),
          "&:hover": {
            background: "transparent",
            color: ({ palette }) => palette.gray[80],
          },
          [`${listItemButtonClasses.disabled}`]: {
            opacity: disabled ? 0.6 : 1,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {content}
    </ListItemButton>
  ) : (
    <ListItem
      sx={[
        { paddingBottom: 0, opacity: disabled ? 0.6 : 1, paddingLeft: 1.5 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {content}
    </ListItem>
  );
};
