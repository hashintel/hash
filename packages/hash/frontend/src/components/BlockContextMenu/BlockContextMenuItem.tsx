import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import {
  bindPopover,
  bindHover,
  usePopupState,
} from "material-ui-popup-state/hooks";
import HoverPopover from "material-ui-popup-state/HoverPopover";
import { VFC } from "react";
import { FontAwesomeIcon } from "../../shared/icons";

export const BlockContextMenuItem: VFC<{
  itemKey: string;
  onClick?: VoidFunction;
  icon: JSX.Element;
  title: JSX.Element | string;
  subMenu?: JSX.Element;
}> = ({ onClick, icon, title, itemKey, subMenu }) => {
  const subMenuPopupState = usePopupState({
    variant: "popper",
    popupId: `${itemKey}-submenu`,
  });

  return (
    <MenuItem
      {...(subMenu
        ? {
            ...bindHover(subMenuPopupState),
          }
        : {
            onClick,
          })}
      sx={{
        position: "relative",
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={title} />
      {subMenu ? (
        <>
          <FontAwesomeIcon
            icon={faChevronRight}
            sx={({ palette }) => ({
              ml: "auto",
              color: palette.gray[50],
              fontSize: 12,
            })}
          />
          <HoverPopover
            {...bindPopover(subMenuPopupState)}
            anchorOrigin={{
              horizontal: "right",
              vertical: "bottom",
            }}
            transformOrigin={{
              horizontal: "left",
              vertical: "top",
            }}
            PaperProps={{
              sx: {
                height: 300,
              },
            }}
          >
            {subMenu}
          </HoverPopover>
        </>
      ) : null}
    </MenuItem>
  );
};
