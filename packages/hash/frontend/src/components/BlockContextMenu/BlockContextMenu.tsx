import React, { useContext, useMemo, useState } from "react";
import { tw } from "twind";

import DeleteIcon from "@material-ui/icons/DeleteOutline";
import CopyIcon from "@material-ui/icons/FileCopyOutlined";
import LoopIcon from "@material-ui/icons/LoopOutlined";
import LinkIcon from "@material-ui/icons/LinkOutlined";
import { useKey } from "rooks";

import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";
import { BlockVariant } from "@hashintel/block-protocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";

import { blockDomId } from "../../blocks/page/BlockView";
import { BlockSuggesterProps } from "../../blocks/page/createSuggester/BlockSuggester";
import { BlockMetaContext } from "../../blocks/blockMeta";
import { NormalView } from "./NormalView";
import { SearchView } from "./SearchView";

type BlockContextMenuProps = {
  blockSuggesterProps: BlockSuggesterProps;
  closeMenu: () => void;
  entityId: string | null;
  entityStore: EntityStore;
};

export type MenuItemType = {
  key: string;
  title: string;
  icon: JSX.Element;
};

const MENU_ITEMS: Array<MenuItemType> = [
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
];

export type MenuState = {
  currentView: "normal" | "search";
  selectedIndex: number;
  subMenuVisible: boolean;
};

export type FilteredMenuItems = {
  actions: Array<MenuItemType>;
  blocks: Array<{
    variant: BlockVariant;
    meta: BlockMeta;
  }>;
};

export type HandleClickMethod = (key: typeof MENU_ITEMS[number]["key"]) => void;

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

  const blocksMeta = useContext(BlockMetaContext);

  const blockOptions = useMemo(() => {
    return Array.from(blocksMeta.values()).flatMap((blockMeta) =>
      blockMeta.componentMetadata.variants.map((variant) => ({
        variant,
        meta: blockMeta,
      })),
    );
  }, [blocksMeta]);

  const usableMenuItems = MENU_ITEMS.filter(({ key }) => {
    return key !== "copyLink" || entityId;
  });

  const searchableActions = usableMenuItems.filter(
    (item) => item.key !== "switchBlock",
  );

  const filteredActions = searchableActions.filter((item) =>
    item.title.toLocaleLowerCase().includes(searchText),
  );

  const filteredBlocks = blockOptions.filter((block) =>
    block.variant.displayName?.toLocaleLowerCase().includes(searchText),
  );

  const filteredMenuItems: FilteredMenuItems = {
    actions: filteredActions,
    blocks: filteredBlocks,
  };

  const search = (newSearchText: string) => {
    setSearchText(newSearchText.toLocaleLowerCase());

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

  const handleClick: HandleClickMethod = (key) => {
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

  const onEnter = () => {
    if (currentView === "normal") {
      if (usableMenuItems[selectedIndex]?.key === "switchBlock") {
        updateMenuState({ subMenuVisible: true });
      } else {
        handleClick(usableMenuItems[selectedIndex].key);
      }
    } else if (selectedIndex < filteredMenuItems.actions.length) {
      handleClick(filteredMenuItems.actions[selectedIndex].key);
    } else {
      const selectedBlock =
        filteredMenuItems.blocks[
          selectedIndex - filteredMenuItems.actions.length
        ];
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
              onEnter();
            }
          }}
        />
      </div>
      {currentView === "normal" ? (
        <NormalView
          usableMenuItems={usableMenuItems}
          updateMenuState={updateMenuState}
          menuState={menuState}
          handleClick={handleClick}
          blockSuggesterProps={blockSuggesterProps}
          blockData={blockData}
        />
      ) : (
        <SearchView
          blockSuggesterProps={blockSuggesterProps}
          entityId={entityId}
          filteredMenuItems={filteredMenuItems}
          handleClick={handleClick}
          menuState={menuState}
          updateMenuState={updateMenuState}
        />
      )}
    </div>
  );
};
