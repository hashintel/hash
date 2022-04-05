import React, { useEffect, useState, useRef } from "react";
import { tw } from "twind";

import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CopyIcon from "@mui/icons-material/FileCopyOutlined";
import LoopIcon from "@mui/icons-material/LoopOutlined";
import LinkIcon from "@mui/icons-material/LinkOutlined";
import { useKey } from "rooks";
import { unstable_batchedUpdates } from "react-dom";

import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";

import {
  addEntityStoreAction,
  entityStorePluginState,
  entityStorePluginStateFromTransaction,
  newDraftId,
} from "@hashintel/hash-shared/entityStorePlugin";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { getBlockDomId } from "../../blocks/page/BlockView";
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
import { useAccountEntities } from "../hooks/useAccountEntities";
import { useCurrentWorkspaceContext } from "../../contexts/CurrentWorkspaceContext";
import { useBlockView } from "../../blocks/page/BlockViewContext";
import PopupState, { bindMenu } from "material-ui-popup-state";
import { Menu } from "@mui/material";

type BlockContextMenuProps = {
  popupState: PopupState;
  blockSuggesterProps: BlockSuggesterProps;
  closeMenu: () => void;
  entityId: string | null;
  entityStore: EntityStore;
  view: EditorView<Schema>;
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
  popupState,
  blockSuggesterProps,
  closeMenu,
  entityId,
  entityStore,
  view,
}) => {
  const blockData = entityId ? entityStore.saved[entityId] : null;
  const { accountId } = useCurrentWorkspaceContext();
  const { fetchEntities } = useAccountEntities();
  const blockView = useBlockView();

  // console.log("blockView => ", blockView);

  const entityStoreRef = useRef(entityStore);
  useEffect(() => {
    entityStoreRef.current = entityStore;
  });

  // const blockEntity = isBlockEntity(blockData)
  //   ? blockData.properties.entity
  //   : null;

  console.log("blockdata => ", blockData);

  useEffect(() => {
    if (isBlockEntity(blockData) && accountId) {
      const blockEntity = blockData.properties.entity;

      fetchEntities(accountId, {
        componentId: blockData.properties.componentId,
      })
        .then((entities) => {
          // debugger;
          if (entities.length === 0) return;

          const currentEntityStore = entityStoreRef.current;
          // @todo UI for picking the entity
          const targetEntity = entities[0]!;

          if (targetEntity.entityId === blockEntity.entityId) return;

          const tr = blockView.view.state.tr;

          const draftEntity = Object.values(currentEntityStore.draft).find(
            (entity) => entity.entityId === targetEntity.entityId,
          );

          if (!draftEntity) {
            const draftId = newDraftId();
            addEntityStoreAction(blockView.view.state, tr, {
              type: "newDraftEntity",
              payload: {
                accountId: targetEntity.accountId,
                draftId,
                entityId: targetEntity.entityId,
              },
            });
            addEntityStoreAction(blockView.view.state, tr, {
              type: "updateEntityProperties",
              payload: {
                draftId,
                merge: false,
                properties: targetEntity.properties,
              },
            });

            blockView.view.dispatch(tr);

            const updatedStore = entityStorePluginStateFromTransaction(
              tr,
              blockView.view.state,
            );

            console.log("updatedStore ==> ", updatedStore);

            blockView.manager
              .createRemoteBlock(
                blockData.properties.componentId,
                updatedStore.store,
                `draft-${blockEntity.entityId}`,
              )
              .then(() => {})
              .catch(() => {});

            // 3. If it is not, put it in the entity store
          }

          /**
           * 4. Update the block entity in the entity store to point to this entity
           */

          // addEntityStoreAction(blockView.view.state, tr, {
          //   type: "updateEntityProperties",
          //   payload: {
          //     draftId: `draft-${blockEntity.entityId}`,
          //     merge: false,
          //     properties: targetEntity.properties,
          //   },
          // });

          /**
           * 5. Update the prosemirror tree to reflect this
           */
          blockView.view.dispatch(tr);
        })
        .catch(() => {});
    }
  }, [blockData, accountId, blockView, fetchEntities]);

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
        url.hash = getBlockDomId(entityId!);
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
    <Menu
      {...bindMenu(popupState)}
      anchorOrigin={{
        horizontal: "left",
        vertical: "bottom",
      }}
      transformOrigin={{
        horizontal: "right",
        vertical: "top",
      }}
    >
      {/* <div
        className={tw`absolute z-10 w-60 bg-white border-gray-200 border-1 shadow-xl rounded`}
      > */}
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
      {/* </div> */}
    </Menu>
  );
};
