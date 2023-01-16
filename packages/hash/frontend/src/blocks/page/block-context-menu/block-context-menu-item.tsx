import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@local/design-system";
import { ListItemIcon, ListItemText } from "@mui/material";
import {
  bindFocus,
  bindHover,
  bindPopover,
  usePopupState,
} from "material-ui-popup-state/hooks";
import HoverPopover from "material-ui-popup-state/HoverPopover";
import {
  cloneElement,
  forwardRef,
  ReactElement,
  RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { MenuItem } from "../../../shared/ui";

type BlockContextMenuItemProps = {
  itemKey: string;
  onClick?: () => void;
  icon: ReactElement;
  title: string;
  subMenu?: ReactElement;
  subMenuWidth?: number;
};

export const BlockContextMenuItem = forwardRef<
  HTMLLIElement,
  BlockContextMenuItemProps
>(({ onClick, icon, title, itemKey, subMenu, subMenuWidth }, ref) => {
  const subMenuPopupState = usePopupState({
    variant: "popper",
    popupId: `${itemKey}-submenu`,
  });
  const [subMenuOffsetTop, setSubmenuOffsetTop] = useState<
    number | undefined
  >();
  const localRef = useRef<HTMLLIElement>(null);
  // @todo this doesn't handle when ref is a function and can break when trying to
  // access offsetTop in the useLayoutEffect. Consider using an library to handle merging refs
  // @see https://github.com/gregberge/react-merge-refs, or better still, use the
  // useForkRef exported by MUI
  const menuItemRef = (ref ?? localRef) as RefObject<HTMLLIElement>;

  useLayoutEffect(() => {
    if (subMenu && !subMenuOffsetTop && menuItemRef.current) {
      setSubmenuOffsetTop(menuItemRef.current.offsetTop);
    }
  }, [subMenu, subMenuOffsetTop, menuItemRef]);

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
        boxShadow: "none !important",

        "&:active": {
          backgroundColor: ({ palette }) =>
            `${palette.primary.main} !important`,
        },

        ...(subMenuPopupState.isOpen && {
          backgroundColor: ({ palette }) => `${palette.gray[20]} !important`,
        }),
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
            {cloneElement(subMenu, { popupState: subMenuPopupState })}
          </HoverPopover>
        </>
      ) : null}
    </MenuItem>
  );
});
