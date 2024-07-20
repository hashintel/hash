import type { FunctionComponent, ReactNode } from "react";
import { ListItemIcon, ListItemText } from "@mui/material";

import { MenuItem } from "../../../../shared/ui";

interface CommentBlockMenuItemProps {
  title: string;
  icon: ReactNode;
  onClick: () => void;
}

export const CommentBlockMenuItem: FunctionComponent<
  CommentBlockMenuItemProps
> = ({ title, icon, onClick }) => (
  <MenuItem key={title} onClick={onClick}>
    <ListItemIcon>{icon}</ListItemIcon>
    <ListItemText primary={title} />
  </MenuItem>
);
