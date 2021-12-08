import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { format } from "date-fns";

import { BlockEntity } from "@hashintel/hash-shared/entity";
import {
  BlockSuggester,
  BlockSuggesterProps,
} from "../../blocks/page/createSuggester/BlockSuggester";
import { useAccountInfos } from "../hooks/useAccountInfos";
import { HandleClickMethod, MenuItemType, MenuState } from "./BlockContextMenu";
import { BlockContextMenuItem } from "./BlockContextMenuItem";

type NormalViewComponent = {
  usableMenuItems: MenuItemType[];
  menuState: MenuState;
  updateMenuState: (updatedState: Partial<MenuState>) => void;
  handleClick: HandleClickMethod;
  blockSuggesterProps: BlockSuggesterProps;
  blockData: BlockEntity | null;
};

export const NormalView: VoidFunctionComponent<NormalViewComponent> = ({
  usableMenuItems,
  menuState,
  updateMenuState,
  handleClick,
  blockSuggesterProps,
  blockData,
}) => {
  const { data: accounts } = useAccountInfos();
  const { selectedIndex, subMenuVisible } = menuState;

  return (
    <>
      <ul className={tw`text-sm mb-4`}>
        {usableMenuItems.map(({ title, icon, key }, index) => {
          return (
            <BlockContextMenuItem
              key={key}
              selected={index === selectedIndex}
              onClick={() => handleClick(key)}
              onSelect={(shouldShowSubMenu) => {
                if (shouldShowSubMenu && key === "switchBlock") {
                  updateMenuState({
                    subMenuVisible: true,
                    selectedIndex: index,
                  });
                } else {
                  updateMenuState({ selectedIndex: index });
                }
              }}
              icon={icon}
              title={title}
              subMenu={
                key === "switchBlock" ? (
                  <BlockSuggester
                    className="left-full ml-0.5 mt-2 block text-left hover:block group-hover:block shadow-xl"
                    {...blockSuggesterProps}
                  />
                ) : null
              }
              subMenuVisible={
                index === selectedIndex &&
                key === "switchBlock" &&
                subMenuVisible
              }
            />
          );
        })}
      </ul>
      <div
        className={tw`border-t-1 border-gray-200 px-4 py-2 text-xs text-gray-400`}
      >
        <p>
          Last edited by {/* @todo use lastedited value when available */}
          {
            accounts.find(
              (account) =>
                account.entityId === blockData?.properties.entity.createdById,
            )?.name
          }
        </p>
        {typeof blockData?.properties.entity.updatedAt === "string" && (
          <p>
            {format(new Date(blockData.properties.entity.updatedAt), "hh.mm a")}
            {", "}
            {format(
              new Date(blockData.properties.entity.updatedAt),
              "dd/MM/yyyy",
            )}
          </p>
        )}
      </div>
    </>
  );
};
