import React, { useState } from "react";
import { tw } from "twind";

import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CopyIcon from "@mui/icons-material/FileCopyOutlined";
import LoopIcon from "@mui/icons-material/LoopOutlined";
import LinkIcon from "@mui/icons-material/LinkOutlined";
import { useKey } from "rooks";
import { unstable_batchedUpdates } from "react-dom";

import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";

import { blockDomId } from "../../blocks/page/BlockView";
import { BlockSuggesterProps } from "../../blocks/page/createSuggester/BlockSuggester";
import { NormalView } from "./NormalView";
import { SearchView } from "./SearchView";
import {
  MenuItemType,
  MenuState,
  FilteredMenuItems,
  ItemClickMethod,
  iconStyles,
} from "./BlockContextMenuUtils";
import { BlockLoaderInput } from "./BlockLoaderInput";
import { useUserBlocks } from "../../blocks/userBlocks";
import { useFilteredBlocks } from "../../blocks/page/createSuggester/useFilteredBlocks";

type BlockContextMenuProps = {
  blockSuggesterProps: BlockSuggesterProps;
  closeMenu: () => void;
  entityId: string | null;
  entityStore: EntityStore;
};

const MENU_ITEMS: Array<MenuItemType> = [
  {
    key: "delete",
    title: "Delete",
    icon: <DeleteIcon className={iconStyles} />,
  },
  {
    key: "duplicate",
    title: "Duplicate",
    icon: <CopyIcon className={iconStyles} />,
  },
  {
    key: "copyLink",
    title: "Copy Link",
    icon: <LinkIcon className={iconStyles} />,
  },
  {
    key: "switchBlock",
    title: "Turn into",
    icon: <LoopIcon className={iconStyles} />,
  },
];

export const BlockContextMenu: React.VFC<BlockContextMenuProps> = ({
  blockSuggesterProps,
  closeMenu,
  entityId,
  entityStore,
}) => {
  const blockData = entityId ? entityStore.saved[entityId] : null;

  if (blockData && !isBlockEntity(blockData)) {
    throw new Error("BlockContextMenu linked to non-block entity");
  }

  const [searchText, setSearchText] = useState("");

  const [menuState, setMenuState] = useState<MenuState>({
    currentView: "normal",
    selectedIndex: 0,
    subMenuVisible: false,
  });

  const { currentView, selectedIndex, subMenuVisible } = menuState;

  const updateMenuState = (updatedState: Partial<MenuState>) => {
    setMenuState((currentMenuState) => ({
      ...currentMenuState,
      ...updatedState,
    }));
  };

  const { value: userBlocks } = useUserBlocks();

  const usableMenuItems = MENU_ITEMS.filter(({ key }) => {
    return key !== "copyLink" || entityId;
  });

  const searchableActions = usableMenuItems.filter(
    (item) => item.key !== "switchBlock",
  );

  const lowerCaseSearchText = searchText.toLocaleLowerCase();

  const filteredActions = searchableActions.filter((item) =>
    item.title.toLocaleLowerCase().includes(lowerCaseSearchText),
  );

  const filteredBlocks = useFilteredBlocks(lowerCaseSearchText, userBlocks);

  const filteredMenuItems: FilteredMenuItems = {
    actions: filteredActions,
    blocks: filteredBlocks,
  };

  const search = (newSearchText: string) => {
    unstable_batchedUpdates(() => {
      setSearchText(newSearchText);

      if (!newSearchText) {
        if (currentView !== "normal") {
          updateMenuState({
            currentView: "normal",
            selectedIndex: 0,
            subMenuVisible: false,
          });
        }
      } else if (currentView !== "search") {
        updateMenuState({
          currentView: "search",
          selectedIndex: 0,
          subMenuVisible: false,
        });
      }
    });
  };

  const getNextIndex = (event: KeyboardEvent, maxLength: number) => {
    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += maxLength;
    index %= maxLength;

    return index;
  };

  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    if (subMenuVisible) return;

    if (currentView === "normal") {
      const nextIndex = getNextIndex(event, usableMenuItems.length);
      updateMenuState({ selectedIndex: nextIndex });
    } else {
      const filteredItemsLength =
        filteredMenuItems.actions.length + filteredMenuItems.blocks.length;

      const nextIndex = getNextIndex(event, filteredItemsLength);
      updateMenuState({ selectedIndex: nextIndex });
    }
  });

  useKey(["ArrowLeft", "ArrowRight"], (event) => {
    if (usableMenuItems[selectedIndex]?.key === "switchBlock") {
      updateMenuState({ subMenuVisible: event.key === "ArrowRight" });
    }
  });

  useKey(["Escape"], () => {
    closeMenu();
  });

  const onItemClick: ItemClickMethod = (key) => {
    // handle menu item click here
    switch (key) {
      case "delete":
        break;
      case "switchBlock":
        updateMenuState({ subMenuVisible: !subMenuVisible });

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

  const onNormalViewEnter = () => {
    // if switchBlock is selected, make the block suggestor menu visible, else select the selected action
    if (usableMenuItems[selectedIndex]?.key === "switchBlock") {
      updateMenuState({ subMenuVisible: true });
    } else {
      onItemClick(usableMenuItems[selectedIndex]!.key);
    }
  };

  const onSearchViewEnter = () => {
    // if selected item is an action, execute the action, else convert the current block to the selected block
    if (selectedIndex < filteredMenuItems.actions.length) {
      onItemClick(filteredMenuItems.actions[selectedIndex]!.key);
    } else {
      const selectedBlock =
        filteredMenuItems.blocks[
          selectedIndex - filteredMenuItems.actions.length
        ]!;
      blockSuggesterProps.onChange(selectedBlock.variant, selectedBlock.meta);
    }
  };

  return (
    <div
      className={tw`absolute z-10 w-60 bg-white border-gray-200 border-1 shadow-xl rounded`}
    >
      <div className={tw`px-4 pt-3 mb-2`}>
        <input
          autoFocus
          value={searchText}
          onChange={(event) => {
            search(event.target.value);
          }}
          className={tw`block w-full px-2 py-1 bg-gray-50 border-1 text-sm rounded-sm `}
          placeholder="Filter actions..."
          onKeyDown={(event) => {
            // Is Enter causing a new-line? Read this: https://hashintel.slack.com/archives/C02K2ARC1BK/p1638433216067800
            if (event.key === "Enter") {
              event.preventDefault();
              if (currentView === "normal") {
                onNormalViewEnter();
              } else {
                onSearchViewEnter();
              }
            }
          }}
        />
        <BlockLoaderInput />
      </div>
      {currentView === "normal" ? (
        <NormalView
          usableMenuItems={usableMenuItems}
          updateMenuState={updateMenuState}
          selectedIndex={selectedIndex}
          subMenuVisible={subMenuVisible}
          onItemClick={onItemClick}
          blockSuggesterProps={blockSuggesterProps}
          blockData={blockData ?? null}
        />
      ) : (
        <SearchView
          blockSuggesterProps={blockSuggesterProps}
          entityId={entityId}
          filteredMenuItems={filteredMenuItems}
          onItemClick={onItemClick}
          selectedIndex={selectedIndex}
          updateMenuState={updateMenuState}
        />
      )}
    </div>
  );
};
