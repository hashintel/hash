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
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
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
import {
  BlockSuggester,
  BlockSuggesterProps,
  getVariantIcon,
} from "../../blocks/page/createSuggester/BlockSuggester";
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
import { useBlockView } from "../../blocks/page/BlockViewContext";
import { useUsers } from "../hooks/useUsers";
import { FontAwesomeIcon } from "../../shared/icons";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import { LoadEntityMenu } from "./LoadEntityMenu";
import { useRouteAccountInfo } from "../../shared/routing";

type BlockContextMenuProps = {
  popupState: PopupState;
  blockSuggesterProps: BlockSuggesterProps;
  entityId: string | null;
  entityStore: EntityStore;
  view: EditorView<Schema>;
};

export const BlockContextMenu = forwardRef<typeof Menu, BlockContextMenuProps>(
  ({ popupState, blockSuggesterProps, entityId, entityStore, view }, ref) => {
    const blockData = entityId ? entityStore.saved[entityId] : null;
    const { data: users } = useUsers();
    const { value: userBlocks } = useUserBlocks();
    const { accountId } = useRouteAccountInfo();
    const { fetchEntities } = useAccountEntities();
    const blockView = useBlockView();

    const blocks = useFilteredBlocks("", userBlocks);

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

    const menuItems = useMemo(() => {
      return [
        {
          key: "add",
          title: "Add an entity",
          icon: <FontAwesomeIcon icon={faAdd} />,
          subMenu: <LoadEntityMenu />,
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
          subMenu: (
            <>
              {blocks.map((option) => (
                <MenuItem
                  onClick={() => {
                    blockSuggesterProps.onChange(option.variant, option.meta);
                  }}
                  key={`${option.meta.name}/${option.variant.name}`}
                >
                  <ListItemIcon>
                    <Box
                      component="img"
                      width={16}
                      height={16}
                      overflow="hidden"
                      alt={option.variant.name}
                      src={getVariantIcon(option)}
                    />
                  </ListItemIcon>
                  <ListItemText primary={option?.variant.name} />
                </MenuItem>
              ))}
            </>
          ),
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
    }, [entityId, blockSuggesterProps, blocks]);

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
          <BlockLoaderInput />
        </Box>

        {usableMenuItems.map(
          ({ key, title, icon, onClick, subMenu }, index) => {
            return (
              <BlockContextMenuItem
                key={key}
                title={title}
                itemKey={key}
                icon={icon}
                onClick={onClick}
                subMenu={subMenu}
              />
            );
          },
        )}

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
