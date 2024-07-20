import { bindMenu } from "material-ui-popup-state";
import type { PopupState } from "material-ui-popup-state/hooks";
import type {
  forwardRef,
  ForwardRefRenderFunction,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKey } from "rooks";
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
import { Box, Divider, Menu, Typography } from "@mui/material";

import { useFetchBlockSubgraph } from "../../../../blocks/use-fetch-block-subgraph";
import { useUserBlocks } from "../../../../blocks/user-blocks";
import { useUsers } from "../../../../components/hooks/use-users";
import { getBlockDomId } from "../../../../shared/get-block-dom-id";
import { ChartNetworkRegularIcon } from "../../../../shared/icons/chart-network-regular-icon";
import { EditEntitySlideOver } from "../../../[shortname]/entities/[entity-uuid].page/edit-entity-slide-over";
import { useBlockContext } from "../block-context";

import { BlockContextMenuItem } from "./block-context-menu-item";
import { BlockListMenuContent } from "./block-list-menu-content";
import { BlockLoaderInput } from "./block-loader-input";
import { BlockSelectDataModal } from "./block-select-data-modal";
import { LoadEntityMenuContent } from "./load-entity-menu-content";

interface BlockContextMenuProps {
  blockEntity: DraftEntity | BlockEntity | null;
  deleteBlock: () => void;
  openConfigMenu: () => void;
  popupState: PopupState;
  canSwap: boolean;
}

const BlockContextMenu: ForwardRefRenderFunction<
  HTMLDivElement,
  BlockContextMenuProps
> = (
  { blockEntity, deleteBlock, openConfigMenu, popupState, canSwap },
  ref,
) => {
  const {
    blockSubgraph,
    setBlockSubgraph,
    blockSelectDataModalIsOpen,
    setBlockSelectDataModalIsOpen,
  } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  const [entityEditorOpen, setEntityEditorOpen] = useState(false);

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

  const menuItems = useMemo(() => {
    /**
     * @see https://linear.app/hash/issue/H-3000
     * @todo Properly type this part of the DraftEntity type.
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
                  closeParentContextMenu={() => {
                    popupState.close();
                  }}
                  childEntityEntityTypeId={
                    blockEntity?.blockChildEntity?.metadata.entityTypeId ?? null
                  }
                  childEntityEntityId={
                    blockEntity?.blockChildEntity?.metadata.recordId.entityId ??
                    null
                  }
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
              onClick: () => {
                setBlockSelectDataModalIsOpen(true);
              },
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
          setEntityEditorOpen(true);
        },
      },
      {
        key: "configure",
        title: "Configure",
        icon: <FontAwesomeIcon icon={faGear} />,
        onClick: () => {
          openConfigMenu();
        },
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
    blockEntity,
    currentComponentId,
    entityId,
    deleteBlock,
    openConfigMenu,
    setBlockSelectDataModalIsOpen,
    popupState,
    canSwap,
    compatibleBlocks,
    blockSchemaHasHasQueryLink,
  ]);

  useKey(["Escape"], () => {
    popupState.close();
  });

  useKey(["@"], () => {
    if (popupState.isOpen) {
      setEntityMenuItemRef.current?.focus();
    }
  });

  useKey(["/"], () => {
    if (popupState.isOpen) {
      swapBlocksMenuItemRef.current?.focus();
    }
  });

  const handleEntityModalSubmit = async () => {
    if (!blockEntity || !blockEntity.blockChildEntity) {
      return;
    }

    const { recordId, entityTypeId } = blockEntity.blockChildEntity.metadata;
    const newBlockSubgraph = await fetchBlockSubgraph(
      entityTypeId,
      recordId.entityId,
    );

    setBlockSubgraph(newBlockSubgraph.subgraph);
    setEntityEditorOpen(false);
  };

  return (
    <>
      {blockSchemaHasHasQueryLink ? (
        <BlockSelectDataModal
          open={blockSelectDataModalIsOpen}
          onClose={() => {
            setBlockSelectDataModalIsOpen(false);
          }}
        />
      ) : null}
      {blockSubgraph && (
        <EditEntitySlideOver
          open={entityEditorOpen}
          entitySubgraph={
            /** @todo Add timeProjection & resolvedTimeProjection properly */
            blockSubgraph
          }
          onSubmit={handleEntityModalSubmit}
          onClose={() => {
            setEntityEditorOpen(false);
          }}
        />
      )}
      <Menu
        {...bindMenu(popupState)}
        ref={ref}
        data-testid={"block-context-menu"}
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
        <Box component={"li"} px={2} pt={1.5} mb={1}>
          <BlockLoaderInput
            onLoad={() => {
              popupState.close();
            }}
          />
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
                subMenu={subMenu}
                subMenuWidth={subMenuWidth}
                closeMenu={() => {
                  popupState.close();
                }}
                onClick={() => {
                  onClick?.();
                  popupState.close();
                }}
                {...(menuItemRef && { ref: menuItemRef })}
              />
            );
          },
        )}

        <Divider />
        <Box px={1.75} pt={1.25} pb={1.5}>
          <Typography
            variant={"microText"}
            sx={({ palette }) => ({
              color: palette.gray[60],
              display: "block",
            })}
          >
            Last edited by
            {/**
             * @see https://linear.app/hash/issue/H-3001
             * @todo Re-implement when provenance fields are made available to the frontend.
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
           * @see https://linear.app/hash/issue/H-3000
           * @todo Re-implement after collab works.
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
