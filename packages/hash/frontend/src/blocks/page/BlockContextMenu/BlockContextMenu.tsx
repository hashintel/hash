import React, { useRef, forwardRef, useMemo } from "react";

import { useKey } from "rooks";
import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";

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
import { getBlockDomId } from "../BlockView";
import { BlockSuggesterProps } from "../createSuggester/BlockSuggester";

import { BlockLoaderInput } from "./BlockLoaderInput";
import { useUsers } from "../../../components/hooks/useUsers";
import { FontAwesomeIcon } from "../../../shared/icons";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import { LoadEntityMenuContent } from "./LoadEntityMenuContent";
import { BlockListMenuContent } from "./BlockListMenuContent";

type BlockContextMenuProps = {
  popupState: PopupState;
  blockSuggesterProps: BlockSuggesterProps;
  entityId: string | null;
  entityStore: EntityStore;
  view: EditorView<Schema>;
};

const LOAD_BLOCK_ENTITY_UI = "hash-load-entity-ui";

export const BlockContextMenu = forwardRef<
  HTMLDivElement,
  BlockContextMenuProps
>(({ popupState, blockSuggesterProps, entityId, entityStore }, ref) => {
  const blockData = entityId ? entityStore.saved[entityId] : null;
  const { data: users } = useUsers();
  const setEntityMenuItemRef = useRef<HTMLLIElement>(null);
  const swapBlocksMenuItemRef = useRef<HTMLLIElement>(null);

  if (blockData && !isBlockEntity(blockData)) {
    throw new Error("BlockContextMenu linked to non-block entity");
  }

  const menuItems = useMemo(() => {
    const hasChildEntity =
      Object.keys(blockData?.properties.entity?.properties ?? {}).length > 0;
    const items = [
      {
        key: "set-entity",
        title: hasChildEntity ? "Swap Entity" : "Add an entity",
        icon: <FontAwesomeIcon icon={faAdd} />,
        // @todo fix this TS issue. all subMenu's require
        // popupState and that's passed in through cloneElement
        // in BlockContextMenuItem
        // For now the temporary fix is to make popupState optional
        // in LoadEntityMenuContent
        subMenu: <LoadEntityMenuContent entityId={entityId} />,
        subMenuWidth: 280,
      },
      {
        key: "copy-link",
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
          <BlockListMenuContent blockSuggesterProps={blockSuggesterProps} />
        ),
        subMenuWidth: 228,
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

    // @todo this flag wouldn't be need once
    // https://app.asana.com/0/1201959586244685/1202106892392942 has been addressed
    if (!localStorage.getItem(LOAD_BLOCK_ENTITY_UI)) {
      items.shift();
    }

    return items;
  }, [blockData, entityId, blockSuggesterProps]);

  useKey(["Escape"], () => {
    popupState.close();
  });

  useKey(["@"], () => {
    if (popupState.isOpen && localStorage.getItem(LOAD_BLOCK_ENTITY_UI)) {
      setEntityMenuItemRef.current?.focus();
    }
  });

  useKey(["/"], () => {
    if (popupState.isOpen) {
      swapBlocksMenuItemRef.current?.focus();
    }
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
      data-testid="block-context-menu"
    >
      <Box component="li" px={2} pt={1.5} mb={1}>
        <BlockLoaderInput />
      </Box>

      {menuItems.map(({ key, title, icon, onClick, subMenu, subMenuWidth }) => {
        if (key === "copy-link" && !entityId) {
          return null;
        }

        let menuItemRef;
        if (key === "set-entity") {
          menuItemRef = setEntityMenuItemRef;
        }
        if (key === "swap-block") {
          menuItemRef = swapBlocksMenuItemRef;
        }

        return (
          <BlockContextMenuItem
            key={key}
            title={title}
            itemKey={key}
            icon={icon}
            onClick={onClick}
            subMenu={subMenu}
            subMenuWidth={subMenuWidth}
            {...(menuItemRef && { ref: menuItemRef })}
          />
        );
      })}

      <Divider />
      <Box px={1.75} pt={1.25} pb={1.5}>
        <Typography
          variant="microText"
          sx={({ palette }) => ({
            color: palette.gray[60],
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
              color: palette.gray[60],
            })}
          >
            {format(new Date(blockData.properties.entity.updatedAt), "hh.mm a")}
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
});
