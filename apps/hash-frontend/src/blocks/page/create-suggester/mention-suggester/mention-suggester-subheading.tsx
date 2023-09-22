import {
  ListItem,
  ListItemButton,
  ListItemText,
  listItemTextClasses,
} from "@mui/material";
import { FunctionComponent, PropsWithChildren } from "react";

import { ArrowUpRightRegularIcon } from "../../../../shared/icons/arrow-up-right-regular-icon";
import { Link } from "../../../../shared/ui";

export const MentionSuggesterSubheading: FunctionComponent<
  PropsWithChildren & { href?: string }
> = ({ children, href }) => {
  const content = (
    <ListItemText
      sx={{
        [`& .${listItemTextClasses.primary}`]: {
          fontSize: 12,
          fontWeight: 600,
          color: ({ palette }) => palette.gray[60],
          textTransform: "uppercase",
        },
      }}
    >
      {children}
      {href ? (
        <ArrowUpRightRegularIcon
          sx={{ fontSize: 12, position: "relative", top: 1, marginLeft: 1 }}
        />
      ) : null}
    </ListItemText>
  );

  return href ? (
    <Link href={href} sx={{ textDecoration: "none" }}>
      <ListItemButton
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
    </Link>
  ) : (
    <ListItem sx={{ paddingBottom: 0 }}>{content}</ListItem>
  );
};
