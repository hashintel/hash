import { VFC } from "react";
import { tw } from "twind";

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
> = ({ selected, onClick, onSelect, icon, title, subMenuVisible, subMenu }) => (
  <li className={tw`flex`}>
    <button
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
    </button>
  </li>
);
