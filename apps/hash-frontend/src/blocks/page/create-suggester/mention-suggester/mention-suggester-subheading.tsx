import {
  ListItem,
  ListItemButton,
  ListItemText,
  listItemTextClasses,
} from "@mui/material";
import { FunctionComponent, PropsWithChildren } from "react";

import { ChevronRightRegularIcon } from "../../../../shared/icons/chevron-right-regular-icon";

export const MentionSuggesterSubheading: FunctionComponent<
  PropsWithChildren & { onClick?: () => void }
> = ({ children, onClick }) => {
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
          marginLeft: 1.5,
        },
      }}
    >
      {children}
      {onClick ? (
        <ChevronRightRegularIcon
          sx={{
            fontSize: 12,
            position: "relative",
            top: 1,
            marginLeft: 1,
            transition: ({ transitions }) => transitions.create("margin-left"),
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
