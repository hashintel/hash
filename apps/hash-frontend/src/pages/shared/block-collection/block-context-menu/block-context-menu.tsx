import {
  faCopy,
  faMessage,
  faPenToSquare,
  faTrashCan,
} from "@fortawesome/free-regular-svg-icons";
import {
  faAdd,
  faArrowRight,
  faGear,
  faLink,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { isHashTextBlock } from "@local/hash-isomorphic-utils/blocks";
import type { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import type { DraftEntity } from "@local/hash-isomorphic-utils/entity-store";
import { blockProtocolLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useHotkeys } from "@mantine/hooks";
import { Box, Divider, Menu, Typography } from "@mui/material";
import { bindMenu } from "material-ui-popup-state";
import type { PopupState } from "material-ui-popup-state/hooks";
import type { ForwardRefRenderFunction } from "react";
import { forwardRef, useCallback, useMemo, useRef } from "react";

import { useFetchBlockSubgraph } from "../../../../blocks/use-fetch-block-subgraph";
import { useUserBlocks } from "../../../../blocks/user-blocks";
import { useUsers } from "../../../../components/hooks/use-users";
import { getBlockDomId } from "../../../../shared/get-block-dom-id";
import { ChartNetworkRegularIcon } from "../../../../shared/icons/chart-network-regular-icon";
import { useSlideStack } from "../../slide-stack";
import { useBlockContext } from "../block-context";
import { BlockContextMenuItem } from "./block-context-menu-item";
import { BlockListMenuContent } from "./block-list-menu-content";
import { BlockLoaderInput } from "./block-loader-input";
import { BlockSelectDataModal } from "./block-select-data-modal";
import { LoadEntityMenuContent } from "./load-entity-menu-content";

type BlockContextMenuProps = {
  blockEntity: DraftEntity | BlockEntity | null;
  deleteBlock: () => void;
  openConfigMenu: () => void;
  popupState: PopupState;
  canSwap: boolean;
};

const BlockContextMenu: ForwardRefRenderFunction<
  HTMLDivElement,
  BlockContextMenuProps
> = (
  { blockEntity, deleteBlock, openConfigMenu, popupState, canSwap },
  ref,
) => {
  const {
    setBlockSubgraph,
    blockSelectDataModalIsOpen,
    setBlockSelectDataModalIsOpen,
  } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  const { users: _users } = useUsers();
  const setEntityMenuItemRef = useRef<HTMLLIElement>(null);
  const swapBlocksMenuItemRef = useRef<HTMLLIElement>(null);
  const { value: userBlocks } = useUserBlocks();
  const currentComponentId = blockEntity?.componentId as string | null;

  // We previously limited blocks you can swap to based on the current block, but this makes for arguably poorer UX
  // @todo figure out how users can swap to blocks with incompatible data expectations, without losing current block data
  const compatibleBlocks = useMemo(() => {
    return Object.values(userBlocks);
  }, [userBlocks]);

  const blockSchema = useMemo(
    () =>
      Object.entries(userBlocks).find(
        ([componentId]) => blockEntity?.componentId === componentId,
      )?.[1]?.schema,
    [userBlocks, blockEntity],
  );

  const blockSchemaHasHasQueryLink = useMemo(
    () =>
      blockSchema?.links &&
      Object.keys(blockSchema.links).includes(
        blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
      ),
    [blockSchema],
  );

  const entityId = blockEntity?.metadata.recordId.entityId ?? null;

  const { pushToSlideStack } = useSlideStack();

  const handleEntityModalSubmit = useCallback(async () => {
    if (!blockEntity || !blockEntity.blockChildEntity) {
      return;
    }

    const { recordId, entityTypeIds } = blockEntity.blockChildEntity.metadata;
    const newBlockSubgraph = await fetchBlockSubgraph(
      entityTypeIds,
      recordId.entityId,
    );

    setBlockSubgraph(newBlockSubgraph.subgraph);
  }, [blockEntity, fetchBlockSubgraph, setBlockSubgraph]);

  const menuItems = useMemo(() => {
    /**
     * @todo properly type this part of the DraftEntity type
     * @see https://linear.app/hash/issue/H-3000
     */
    const hasChildEntityWithData =
      Object.keys(blockEntity?.blockChildEntity?.properties ?? []).length > 0;
    const items = [
      ...(currentComponentId && !isHashTextBlock(currentComponentId)
        ? [
            {
              key: "set-entity",
              title: hasChildEntityWithData ? "Swap Entity" : "Add an entity",
              icon: <FontAwesomeIcon icon={faAdd} />,
              subMenu: (
                <LoadEntityMenuContent
                  blockEntityId={entityId}
                  childEntityEntityTypeId={
                    /**
                     * @todo make menu properly support multi-type entities
                     */
                    blockEntity?.blockChildEntity?.metadata.entityTypeIds[0] ??
                    null
                  }
                  childEntityEntityId={
                    blockEntity?.blockChildEntity?.metadata.recordId.entityId ??
                    null
                  }
                  closeParentContextMenu={() => popupState.close()}
                />
              ),
              subMenuWidth: 280,
            },
          ]
        : []),
      ...(blockSchemaHasHasQueryLink
        ? [
            {
              key: "select-data",
              title: "Select Data",
              icon: <ChartNetworkRegularIcon />,
              onClick: () => setBlockSelectDataModalIsOpen(true),
            },
          ]
        : []),
      {
        key: "copy-link",
        title: "Copy Link",
        icon: <FontAwesomeIcon icon={faLink} />,
        onClick: () => {
          const url = new URL(document.location.href);
          url.hash = getBlockDomId((entityId ?? undefined)!);
          void navigator.clipboard.writeText(url.toString());
        },
      },
      {
        key: "edit-block",
        title: "Edit Block",
        icon: <FontAwesomeIcon icon={faPenToSquare} />,
        onClick: () => {
          if (blockEntity?.blockChildEntity) {
            pushToSlideStack({
              kind: "entity",
              itemId: blockEntity.blockChildEntity.metadata.recordId.entityId,
              onEntityDbChange: () => handleEntityModalSubmit(),
            });
          }
        },
      },
      {
        key: "configure",
        title: "Configure",
        icon: <FontAwesomeIcon icon={faGear} />,
        onClick: () => openConfigMenu(),
      },
      {
        key: "duplicate",
        title: "Duplicate",
        icon: <FontAwesomeIcon icon={faCopy} />,
        isNotYetImplemented: true,
      },
      {
        key: "delete",
        title: "Delete",
        icon: <FontAwesomeIcon icon={faTrashCan} />,
        onClick: deleteBlock,
      },
      ...(canSwap && compatibleBlocks.length > 1
        ? [
            {
              key: "swap-block",
              title: "Swap block type",
              icon: <FontAwesomeIcon icon={faRefresh} />,
              subMenu: (
                <BlockListMenuContent compatibleBlocks={compatibleBlocks} />
              ),
              subMenuWidth: 228,
            },
          ]
        : []),
      {
        key: "move-to-page",
        title: "Move to page",
        icon: <FontAwesomeIcon icon={faArrowRight} />,
        isNotYetImplemented: true,
      },
      {
        key: "comment",
        title: "Comment",
        icon: <FontAwesomeIcon icon={faMessage} />,
        isNotYetImplemented: true,
      },
    ];

    return items;
  }, [
    blockEntity?.blockChildEntity,
    blockSchemaHasHasQueryLink,
    canSwap,
    compatibleBlocks,
    currentComponentId,
    deleteBlock,
    entityId,
    handleEntityModalSubmit,
    openConfigMenu,
    popupState,
    pushToSlideStack,
    setBlockSelectDataModalIsOpen,
  ]);

  useHotkeys([
    [
      "Escape",
      () => {
        popupState.close();
      },
    ],
    [
      "@",
      () => {
        if (popupState.isOpen) {
          setEntityMenuItemRef.current?.focus();
        }
      },
    ],
    [
      "/",
      () => {
        if (popupState.isOpen) {
          swapBlocksMenuItemRef.current?.focus();
        }
      },
    ],
  ]);

  return (
    <>
      {blockSchemaHasHasQueryLink ? (
        <BlockSelectDataModal
          open={blockSelectDataModalIsOpen}
          onClose={() => setBlockSelectDataModalIsOpen(false)}
        />
      ) : null}
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
          <BlockLoaderInput onLoad={() => popupState.close()} />
        </Box>

        {menuItems.map(
          ({
            icon,
            isNotYetImplemented,
            key,
            onClick,
            subMenu,
            subMenuWidth,
            title,
          }) => {
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

            if (isNotYetImplemented) {
              return null;
            }

            return (
              <BlockContextMenuItem
                key={key}
                title={title}
                itemKey={key}
                icon={icon}
                closeMenu={() => popupState.close()}
                onClick={() => {
                  onClick?.();
                  popupState.close();
                }}
                subMenu={subMenu}
                subMenuWidth={subMenuWidth}
                {...(menuItemRef && { ref: menuItemRef })}
              />
            );
          },
        )}

        <Divider />
        <Box px={1.75} pt={1.25} pb={1.5}>
          <Typography
            variant="microText"
            sx={({ palette }) => ({
              color: palette.gray[60],
              display: "block",
            })}
          >
            Last edited by
            {/**
             * @todo re-implement when provenance fields are made available to the frontend
             * @see https://linear.app/hash/issue/H-3001
             */}
            {/* {
            users?.find(
              (account) =>
                account.entityId ===
                blockEntity?.properties.entity.createdByAccountId,
            )?.displayName
          } */}
          </Typography>
          {/**
           * @todo re-implement after collab works
           * @see https://linear.app/hash/issue/H-3000
           */}
          {/* {typeof blockEntity?.properties.entity.updatedAt === "string" && (
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                color: palette.gray[60],
              })}
            >
              {format(
                new Date(blockEntity.properties.entity.updatedAt),
                "hh.mm a",
              )}
              {", "}
              {format(
                new Date(blockEntity.properties.entity.updatedAt),
                "dd/MM/yyyy",
              )}
            </Typography>
          )} */}
        </Box>
      </Menu>
    </>
  );
};

const BlockContextMenuForwardedRef = forwardRef(BlockContextMenu);

export { BlockContextMenuForwardedRef as BlockContextMenu };
