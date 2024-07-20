import type { PopupState } from "material-ui-popup-state/hooks";
import type { ReactElement } from "react";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { ListItemIcon, listItemIconClasses, ListItemText } from "@mui/material";

import { MenuItem } from "../../../ui";

export const EntityTypeMenuItem = ({
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
      sx={{
        [`> .${listItemIconClasses.root}`]: {
          width: 18,
          display: "inline-flex",
          justifyContent: "center",
        },
      }}
      onClick={onClick ?? popupState.close}
    >
      <ListItemIcon>
        {"icon" in icon ? <FontAwesomeIcon icon={icon} /> : icon}
      </ListItemIcon>
      <ListItemText primary={title} />
    </MenuItem>
  );
};
