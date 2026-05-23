import { ListItemIcon, ListItemText } from "@mui/material";

import { MenuItem } from "../../../../shared/ui";

import type { FunctionComponent, ReactNode } from "react";

type CommentBlockMenuItemProps = {
  title: string;
  icon: ReactNode;
  onClick: () => void;
};

export const CommentBlockMenuItem: FunctionComponent<CommentBlockMenuItemProps> = ({
  title,
  icon,
  onClick,
}) => (
  <MenuItem key={title} onClick={onClick}>
    <ListItemIcon>{icon}</ListItemIcon>
    <ListItemText primary={title} />
  </MenuItem>
);
