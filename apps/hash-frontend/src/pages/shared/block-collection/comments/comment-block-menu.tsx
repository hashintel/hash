import { Menu } from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import { bindMenu } from "material-ui-popup-state/hooks";
import type { FunctionComponent, ReactNode } from "react";

type CommentBlockMenuProps = {
  popupState: PopupState;
  children: ReactNode;
};

export const CommentBlockMenu: FunctionComponent<CommentBlockMenuProps> = ({
  popupState,
  children,
}) => {
  const bindMenuProps = bindMenu(popupState);

  return (
    <Menu
      {...bindMenuProps}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
    >
      {children}
    </Menu>
  );
};
