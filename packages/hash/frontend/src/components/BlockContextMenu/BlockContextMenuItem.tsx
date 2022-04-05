import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { VFC } from "react";
import { tw } from "twind";
import { Popover } from "../../shared/ui";

export const BlockContextMenuItem: VFC<
  {
    selected: boolean;
    onClick: VoidFunction;
    onSelect: (shouldShowSubMenu: boolean) => void;
    icon: JSX.Element;
    title: JSX.Element | string;
  } & (
    | {
        subMenuVisible?: undefined;
        subMenu?: undefined;
      }
    | { subMenuVisible: boolean; subMenu: JSX.Element | null }
  )
> = ({ selected, onClick, onSelect, icon, title, subMenuVisible, subMenu }) => {
  const subMenuPopupState = usePopupState({
    variant: "popover",
    popupId: `menu-${title}-id`, // @todo think of a better id
  });

  return (
    <MenuItem onClick={onClick}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={title} />
      {subMenu ? (
        <>
          <span
            onMouseOver={() => subMenuPopupState.open()}
            onFocus={() => subMenuPopupState.open()}
            className={tw`ml-auto`}
          >
            &rarr;
          </span>
          <Popover {...bindPopover(subMenuPopupState)} open={true}>
            {subMenu}
          </Popover>
        </>
      ) : null}
      {/* <button
      className={tw`flex-1 hover:bg-gray-100 ${
        selected ? "bg-gray-100" : ""
      }  flex items-center py-1 px-4 group`}
      onFocus={() => onSelect(false)}
      onMouseOver={() => onSelect(true)}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{title}</span>
      {subMenu ? (
        <>
          <span className={tw`ml-auto`}>&rarr;</span>
          {selected && subMenuVisible ? subMenu : null}
        </>
      ) : null}
    </button> */}
    </MenuItem>
  );
};
