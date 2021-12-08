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
            <li key={key} className={tw`flex`}>
              <button
                className={tw`flex-1 hover:bg-gray-100 ${
                  index === selectedIndex ? "bg-gray-100" : ""
                }  flex items-center py-1 px-4 group`}
                onFocus={() => updateMenuState({ selectedIndex: index })}
                onMouseOver={() => {
                  if (key === "switchBlock") {
                    updateMenuState({
                      subMenuVisible: true,
                      selectedIndex: index,
                    });
                  } else {
                    updateMenuState({ selectedIndex: index });
                  }
                }}
                onClick={() => handleClick(key)}
                type="button"
              >
                {icon}
                <span>{title}</span>
                {key === "switchBlock" && (
                  <span className={tw`ml-auto`}>&rarr;</span>
                )}
                {key === "switchBlock" &&
                  index === selectedIndex &&
                  subMenuVisible && (
                    <BlockSuggester
                      className="left-full ml-0.5 mt-2 block text-left hover:block group-hover:block shadow-xl"
                      {...blockSuggesterProps}
                    />
                  )}
              </button>
            </li>
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
