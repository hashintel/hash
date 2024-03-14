import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import type { FunctionComponent, ReactElement } from "react";
import { useMemo } from "react";

import type { MenuItemProps } from "../../../shared/ui/menu-item";
import { ContextBarActionsContext } from "./context-bar-actions-context";

export const ContextBarActionsDropdown: FunctionComponent<{
  children: ReactElement<MenuItemProps> | ReactElement<MenuItemProps>[];
}> = ({ children }) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "context-bar-actions-dropdown-menu",
  });

  const contextBarActionsContextValue = useMemo(() => {
    return { closeContextMenu: popupState.close };
  }, [popupState]);

  return (
    <ContextBarActionsContext.Provider value={contextBarActionsContextValue}>
      <IconButton {...bindTrigger(popupState)}>
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </IconButton>
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            borderRadius: "6px",
            marginTop: 1,
            border: ({ palette }) => `1px solid ${palette.gray["20"]}`,
          },
        }}
      >
        {children}
      </Menu>
    </ContextBarActionsContext.Provider>
  );
};
