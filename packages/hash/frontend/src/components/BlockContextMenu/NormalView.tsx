import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { format } from "date-fns";
import { BlockEntity } from "@hashintel/hash-shared/entity";

import {
  BlockSuggester,
  BlockSuggesterProps,
} from "../../blocks/page/createSuggester/BlockSuggester";
import { useUsers } from "../hooks/useUsers";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import {
  MenuItemType,
  MenuState,
  ItemClickMethod,
} from "./BlockContextMenuUtils";

type NormalViewComponentProps = {
  usableMenuItems: MenuItemType[];
  subMenuVisible: boolean;
  updateMenuState: (updatedState: Partial<MenuState>) => void;
  selectedIndex: number;
  onItemClick: ItemClickMethod;
  blockSuggesterProps: BlockSuggesterProps;
  blockData: BlockEntity | null;
};

export const NormalView: VoidFunctionComponent<NormalViewComponentProps> = ({
  usableMenuItems,
  selectedIndex,
  subMenuVisible,
  updateMenuState,
  onItemClick,
  blockSuggesterProps,
  blockData,
}) => {
  const { data: users } = useUsers();

  return (
    <>
      {usableMenuItems.map(({ title, icon, key }, index) => {
        return (
          <BlockContextMenuItem
            key={key}
            // selected={index === selectedIndex}
            // onClick={() => onItemClick(key)}
            // onSelect={(shouldShowSubMenu) => {
            //   if (shouldShowSubMenu && key === "switchBlock") {
            //     updateMenuState({
            //       subMenuVisible: true,
            //       selectedIndex: index,
            //     });
            //   } else {
            //     updateMenuState({ selectedIndex: index });
            //   }
            // }}
            icon={icon}
            title={title}
            subMenu={
              key === "switchBlock" ? (
                <BlockSuggester
                  sx={{
                    left: "100%",
                    marginLeft: "0.125rem",
                    marginTop: "0.5rem",
                  }}
                  {...blockSuggesterProps}
                />
              ) : null
            }
            // subMenuVisible={
            //   index === selectedIndex && key === "switchBlock" && subMenuVisible
            // }
          />
        );
      })}
    </>
  );
};
