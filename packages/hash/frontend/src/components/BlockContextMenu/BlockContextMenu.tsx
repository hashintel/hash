import React, { useEffect, useState, useRef, forwardRef, useMemo } from "react";
import { tw } from "twind";

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
import { Box, Divider, Menu, Typography } from "@mui/material";
import { bindMenu } from "material-ui-popup-state";
import { PopupState } from "material-ui-popup-state/hooks";
import { format } from "date-fns";
import {
  faAdd,
  faArrowRight,
  faLink,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import {
  faCopy,
  faMessage,
  faTrashCan,
} from "@fortawesome/free-regular-svg-icons";
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
import { useUsers } from "../hooks/useUsers";
import { FontAwesomeIcon } from "../../shared/icons";
import { BlockContextMenuItem } from "./BlockContextMenuItem";

type BlockContextMenuProps = {
  popupState: PopupState;
  blockSuggesterProps: BlockSuggesterProps;
  entityId: string | null;
  entityStore: EntityStore;
  view: EditorView<Schema>;
};

const MENU_ITEMS: Array<MenuItemType> = [
  {
    key: "add",
    title: "Add an entity",
    icon: <FontAwesomeIcon icon={faAdd} />,
  },
  {
    key: "copyLink",
    title: "Copy Link",
    icon: <FontAwesomeIcon icon={faLink} />,
  },
  {
    key: "duplicate",
    title: "Duplicate",
    icon: <FontAwesomeIcon icon={faCopy} />,
  },
  {
    key: "delete",
    title: "Delete",
    icon: <FontAwesomeIcon icon={faTrashCan} />,
  },
  {
    key: "swap-block",
    title: "Swap block type",
    icon: <FontAwesomeIcon icon={faRefresh} />,
  },
  {
    key: "move-to-page",
    title: "Move to page",
    icon: <FontAwesomeIcon icon={faArrowRight} />,
  },
  {
    key: "comment",
    title: "Comment",
    icon: <FontAwesomeIcon icon={faMessage} />,
  },
];

export const BlockContextMenu = forwardRef<typeof Menu, BlockContextMenuProps>(
  ({ popupState, blockSuggesterProps, entityId, entityStore, view }, ref) => {
    const blockData = entityId ? entityStore.saved[entityId] : null;
    const { data: users } = useUsers();
    const { value: userBlocks } = useUserBlocks();
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

    useEffect(() => {
      // if (isBlockEntity(blockData) && accountId) {
      //   const blockEntity = blockData.properties.entity;
      //   fetchEntities(accountId, {
      //     componentId: blockData.properties.componentId,
      //   })
      //     .then((entities) => {
      //       // debugger;
      //       if (entities.length === 0) return;
      //       const currentEntityStore = entityStoreRef.current;
      //       // @todo UI for picking the entity
      //       const targetEntity = entities[0]!;
      //       if (targetEntity.entityId === blockEntity.entityId) return;
      //       const tr = blockView.view.state.tr;
      //       const draftEntity = Object.values(currentEntityStore.draft).find(
      //         (entity) => entity.entityId === targetEntity.entityId,
      //       );
      //       if (!draftEntity) {
      //         const draftId = newDraftId();
      //         addEntityStoreAction(blockView.view.state, tr, {
      //           type: "newDraftEntity",
      //           payload: {
      //             accountId: targetEntity.accountId,
      //             draftId,
      //             entityId: targetEntity.entityId,
      //           },
      //         });
      //         addEntityStoreAction(blockView.view.state, tr, {
      //           type: "updateEntityProperties",
      //           payload: {
      //             draftId,
      //             merge: false,
      //             properties: targetEntity.properties,
      //           },
      //         });
      //         blockView.view.dispatch(tr);
      //         const updatedStore = entityStorePluginStateFromTransaction(
      //           tr,
      //           blockView.view.state,
      //         );
      //         console.log("updatedStore ==> ", updatedStore);
      //         blockView.manager
      //           .createRemoteBlock(
      //             blockData.properties.componentId,
      //             updatedStore.store,
      //             `draft-${blockEntity.entityId}`,
      //           )
      //           .then(() => {})
      //           .catch(() => {});
      //         // 3. If it is not, put it in the entity store
      //       }
      //       /**
      //        * 4. Update the block entity in the entity store to point to this entity
      //        */
      //       // addEntityStoreAction(blockView.view.state, tr, {
      //       //   type: "updateEntityProperties",
      //       //   payload: {
      //       //     draftId: `draft-${blockEntity.entityId}`,
      //       //     merge: false,
      //       //     properties: targetEntity.properties,
      //       //   },
      //       // });
      //       /**
      //        * 5. Update the prosemirror tree to reflect this
      //        */
      //       blockView.view.dispatch(tr);
      //     })
      //     .catch(() => {});
      // }
    }, [blockData, accountId, blockView, fetchEntities]);

    if (blockData && !isBlockEntity(blockData)) {
      throw new Error("BlockContextMenu linked to non-block entity");
    }

    const [menuState, setMenuState] = useState<MenuState>({
      currentView: "normal",
      selectedIndex: 0,
      subMenuVisible: false,
    });

    const { currentView, selectedIndex, subMenuVisible } = menuState;

    const menuItems = useMemo(() => {
      return [
        {
          key: "add",
          title: "Add an entity",
          icon: <FontAwesomeIcon icon={faAdd} />,
        },
        {
          key: "copyLink",
          title: "Copy Link",
          icon: <FontAwesomeIcon icon={faLink} />,
          onClick: () => {
            const url = new URL(document.location.href);
            url.hash = getBlockDomId(entityId!);
            void navigator.clipboard.writeText(url.toString());
          },
        },
        {
          key: "duplicate",
          title: "Duplicate",
          icon: <FontAwesomeIcon icon={faCopy} />,
        },
        {
          key: "delete",
          title: "Delete",
          icon: <FontAwesomeIcon icon={faTrashCan} />,
        },
        {
          key: "swap-block",
          title: "Swap block type",
          icon: <FontAwesomeIcon icon={faRefresh} />,
        },
        {
          key: "move-to-page",
          title: "Move to page",
          icon: <FontAwesomeIcon icon={faArrowRight} />,
        },
        {
          key: "comment",
          title: "Comment",
          icon: <FontAwesomeIcon icon={faMessage} />,
        },
      ];
    }, [entityId]);

    const usableMenuItems = menuItems.filter(({ key }) => {
      return key !== "copyLink" || entityId;
    });

    useKey(["Escape"], () => {
      popupState.close();
    });

    return (
      <Menu
        {...bindMenu(popupState)}
        ref={ref}
        anchorOrigin={{
          horizontal: "left",
          vertical: "bottom",
        }}
        transformOrigin={{
          horizontal: "right",
          vertical: "top",
        }}
        PaperProps={{
          sx: {
            width: 228,
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            pt: 1.5,
            mb: 1,
          }}
        >
          {/* <input
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
        /> */}
          <BlockLoaderInput />
        </Box>

        {usableMenuItems.map(({ key, title, icon, onClick }, index) => {
          return (
            <BlockContextMenuItem
              key={key}
              title={title}
              icon={icon}
              onClick={onClick}
              // subMenu={
              //   key === "swap-block" ? (
              //     <BlockSuggester
              //       sx={{
              //         left: "100%",
              //         marginLeft: "0.125rem",
              //         marginTop: "0.5rem",
              //       }}
              //       {...blockSuggesterProps}
              //     />
              //   ) : null
              // }
            />
          );
        })}

        <Divider />
        <Box
          sx={{
            px: 1.75,
            pt: 1.25,
            pb: 1.5,
          }}
        >
          <Typography
            variant="microText"
            sx={({ palette }) => ({
              color: palette.gray[70],
              display: "block",
            })}
          >
            Last edited by {/* @todo use lastedited value when available */}
            {
              users.find(
                (account) =>
                  account.entityId ===
                  blockData?.properties.entity.createdByAccountId,
              )?.name
            }
          </Typography>

          {typeof blockData?.properties.entity.updatedAt === "string" && (
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                color: palette.gray[70],
              })}
            >
              {format(
                new Date(blockData.properties.entity.updatedAt),
                "hh.mm a",
              )}
              {", "}
              {format(
                new Date(blockData.properties.entity.updatedAt),
                "dd/MM/yyyy",
              )}
            </Typography>
          )}
        </Box>
      </Menu>
    );
  },
);
