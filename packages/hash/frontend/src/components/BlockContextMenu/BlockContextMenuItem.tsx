import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import {
  bindPopover,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { VFC } from "react";

export const BlockContextMenuItem: VFC<
  {
    selected?: boolean;
    onClick?: VoidFunction;
    onSelect?: (shouldShowSubMenu: boolean) => void;
    icon: JSX.Element;
    title: JSX.Element | string;
  } & (
    | {
        subMenuVisible?: undefined;
        subMenu?: undefined;
      }
    | { subMenuVisible?: boolean; subMenu?: JSX.Element | null }
  )
> = ({ selected, onClick, onSelect, icon, title, subMenu }) => {
  const subMenuPopupState = usePopupState({
    variant: "popover",
    popupId: `menu-${title}-id`, // @todo think of a better id
  });

  const { onClick: triggerOnClick, ...triggerAttrs } =
    bindTrigger(subMenuPopupState);

  return (
    <MenuItem
      {...(subMenu && {
        ...triggerAttrs,
        // onMouseOver: () => subMenuPopupState.open(),
      })}
      onClick={(evt) => {
        if (subMenu) {
          triggerOnClick(evt);
        } else {
          onClick();
        }
      }}
      sx={{
        position: "relative",
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={title} />
      {/* {subMenu ? (
        <>
          <span className={tw`ml-auto`}>&rarr;</span>
          <Popover
            {...bindPopover(subMenuPopupState)}
            sx={{
              backgroundColor: "red",
            }}
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
                backgroundColor: "red",
                width: 240,
                height: 200,
              },
            }}
          >
            {subMenu}
          </Popover>
        </>
      ) : null} */}
    </MenuItem>
  );
};
