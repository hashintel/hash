import { ListItemIcon, listItemIconClasses, ListItemText } from "@mui/material";

import { FontAwesomeIcon } from "@hashintel/design-system";

import { MenuItem } from "../../../../../../ui";

import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { PopupState } from "material-ui-popup-state/hooks";
import type { ReactElement } from "react";

export const SidebarMenuItem = ({
  title,
  icon,
  href,
  faded,
  onClick,
  popupState,
}: {
  title: string;
  icon: IconDefinition | ReactElement;
  faded?: boolean;
  popupState: PopupState;
} & (
  | { href: string; onClick?: null }
  | { href?: null; onClick: () => void }
)) => {
  return (
    <MenuItem
      {...(href ? { href } : {})}
      faded={faded}
      onClick={onClick ?? popupState.close}
      sx={{
        [`> .${listItemIconClasses.root}`]: {
          width: 18,
          display: "inline-flex",
          justifyContent: "center",
        },
      }}
    >
      <ListItemIcon>
        {"icon" in icon ? <FontAwesomeIcon icon={icon} /> : icon}
      </ListItemIcon>
      <ListItemText primary={title} />
    </MenuItem>
  );
};
