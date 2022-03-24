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
      <ul className={tw`text-sm mb-4`}>
        {usableMenuItems.map(({ title, icon, key }, index) => {
          return (
            <BlockContextMenuItem
              key={key}
              selected={index === selectedIndex}
              onClick={() => onItemClick(key)}
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
                    sx={{
                      left: "100%",
                      marginLeft: "0.125rem",
                      marginTop: "0.5rem",
                      textAlign: "left",
                    }}
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
            users.find(
              (account) =>
                account.entityId ===
                blockData?.properties.entity.createdByAccountId,
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
