import React, { useState } from "react";
import { tw } from "twind";
import { format } from "date-fns";

import DeleteIcon from "@material-ui/icons/DeleteOutline";
import CopyIcon from "@material-ui/icons/FileCopyOutlined";
import LoopIcon from "@material-ui/icons/LoopOutlined";
import LinkIcon from "@material-ui/icons/LinkOutlined";
import { useKey } from "rooks";

import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";
import { blockDomId } from "../../blocks/page/BlockView";
import {
  BlockSuggester,
  BlockSuggesterProps,
} from "../../blocks/page/createSuggester/BlockSuggester";

import { useAccountInfos } from "../hooks/useAccountInfos";

type BlockContextMenuProps = {
  blockSuggesterProps: BlockSuggesterProps;
  closeMenu: () => void;
  entityId: string | null;
  entityStore: EntityStore;
};

const MENU_ITEMS = [
  {
    key: "delete",
    title: "Delete",
    icon: <DeleteIcon className={tw`!text-inherit mr-1`} />,
  },
  {
    key: "duplicate",
    title: "Duplicate",
    icon: <CopyIcon className={tw`!text-inherit mr-1`} />,
  },
  {
    key: "copyLink",
    title: "Copy Link",
    icon: <LinkIcon className={tw`!text-inherit mr-1`} />,
  },
  {
    key: "switchBlock",
    title: "Turn into",
    icon: <LoopIcon className={tw`!text-inherit mr-1`} />,
  },
] as const;

export const BlockContextMenu: React.VFC<BlockContextMenuProps> = ({
  blockSuggesterProps,
  closeMenu,
  entityId,
  entityStore,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subMenuVisible, setSubMenuVisible] = useState(false);

  const { data: accounts } = useAccountInfos();

  const blockData = entityId ? entityStore.saved[entityId] : null;

  if (blockData && !isBlockEntity(blockData)) {
    throw new Error("BlockContextMenu linked to non-block entity");
  }

  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    if (subMenuVisible) return;

    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += MENU_ITEMS.length;
    index %= MENU_ITEMS.length;
    setSelectedIndex(index);
  });

  useKey(["ArrowLeft", "ArrowRight"], (event) => {
    if (MENU_ITEMS[selectedIndex]?.key === "switchBlock") {
      setSubMenuVisible(event.key === "ArrowRight");
    }
  });

  const handleClick = (key: typeof MENU_ITEMS[number]["key"]) => {
    // handle menu item click here
    switch (key) {
      case "delete":
        break;
      case "switchBlock":
        setSubMenuVisible(!subMenuVisible);
        break;
      case "copyLink": {
        const url = new URL(document.location.href);
        url.hash = blockDomId(entityId!);
        void navigator.clipboard.writeText(url.toString());
        break;
      }
    }

    if (key !== "switchBlock") {
      closeMenu();
    }
  };

  return (
    <div
      className={tw`absolute z-10 w-60 bg-white border-gray-200 border-1 shadow-xl rounded`}
    >
      <div className={tw`px-4 pt-3 mb-2`}>
        <input
          className={tw`block w-full px-2 py-1 bg-gray-50 border-1 text-sm rounded-sm `}
          placeholder="Filter actions..."
        />
      </div>
      <ul className={tw`text-sm mb-4`}>
        {MENU_ITEMS.map(({ title, icon, key }, index) => {
          if (key === "copyLink" && !entityId) {
            return null;
          }
          return (
            <li key={key} className={tw`flex`}>
              <button
                className={tw`flex-1 hover:bg-gray-100 ${
                  index === selectedIndex ? "bg-gray-100" : ""
                }  flex items-center py-1 px-4 group`}
                onFocus={() => setSelectedIndex(index)}
                onMouseOver={() => setSelectedIndex(index)}
                onClick={() => handleClick(key)}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter") {
                    handleClick(key);
                  }
                }}
                type="button"
              >
                {icon}
                <span>{title}</span>
                {key === "switchBlock" && (
                  <span className={tw`ml-auto`}>&rarr;</span>
                )}
                {key === "switchBlock" && index === selectedIndex && (
                  <BlockSuggester
                    className={`left-full ml-0.5 mt-2 ${
                      subMenuVisible ? "block" : "hidden"
                    } text-left hover:block group-hover:block shadow-xl`}
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
    </div>
  );
};
