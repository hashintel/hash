import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import {
  bindPopover,
  bindHover,
  bindFocus,
  usePopupState,
} from "material-ui-popup-state/hooks";
import HoverPopover from "material-ui-popup-state/HoverPopover";
import { useEffect, useRef, useState, VFC } from "react";
import { FontAwesomeIcon } from "../../shared/icons";

export const BlockContextMenuItem: VFC<{
  itemKey: string;
  onClick?: VoidFunction;
  icon: JSX.Element;
  title: JSX.Element | string;
  subMenu?: JSX.Element;
  subMenuWidth?: number;
}> = ({ onClick, icon, title, itemKey, subMenu, subMenuWidth }) => {
  const subMenuPopupState = usePopupState({
    variant: "popper",
    popupId: `${itemKey}-submenu`,
    // consider using parentPopupState
  });
  const [subMenuOffsetTop, setSubmenuOffsetTop] = useState<
    number | undefined
  >();
  const menuItemRef = useRef<HTMLLIElement>(null);

  if (subMenu && !subMenuOffsetTop && menuItemRef.current) {
    setSubmenuOffsetTop(menuItemRef.current.offsetTop);
  }

  return (
    <MenuItem
      ref={menuItemRef}
      {...(subMenu
        ? {
            ...bindHover(subMenuPopupState),
            ...bindFocus(subMenuPopupState),
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
            elevation={4}
            anchorOrigin={{
              horizontal: "right",
              vertical: subMenuOffsetTop ? -subMenuOffsetTop : "top",
            }}
            transformOrigin={{
              horizontal: "left",
              vertical: "top",
            }}
            PaperProps={{
              sx: {
                height: 300,
                width: subMenuWidth,
                ml: 1,
                py: 0.5,
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
