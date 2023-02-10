import {
  faCopy,
  faMessage,
  faPenToSquare,
  faTrashCan,
} from "@fortawesome/free-regular-svg-icons";
// import { format } from "date-fns";
import {
  faAdd,
  faArrowRight,
  faGear,
  faLink,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  areComponentsCompatible,
  isHashTextBlock,
} from "@local/hash-isomorphic-utils/blocks";
import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import {
  PropertyObject,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph";
import { EntityId } from "@local/hash-subgraph/src/types";
import { Box, Divider, Menu, Typography } from "@mui/material";
import { bindMenu } from "material-ui-popup-state";
import { PopupState } from "material-ui-popup-state/hooks";
import {
  forwardRef,
  ForwardRefRenderFunction,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKey } from "rooks";

import { useUsers } from "../../../components/hooks/use-users";
import { EditEntityModal } from "../../../pages/[shortname]/entities/[entity-uuid].page/edit-entity-modal";
import { useFetchBlockSubgraph } from "../../use-fetch-block-subgraph";
import { useUserBlocks } from "../../user-blocks";
import { useBlockContext } from "../block-context";
import { getBlockDomId } from "../block-view";
import { BlockContextMenuItem } from "./block-context-menu-item";
import { BlockListMenuContent } from "./block-list-menu-content";
import { BlockLoaderInput } from "./block-loader-input";
import { LoadEntityMenuContent } from "./load-entity-menu-content";

type BlockContextMenuProps = {
  blockEntity: BlockEntity | null;
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
  const { blockSubgraph, setBlockSubgraph } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  const [entityEditorOpen, setEntityEditorOpen] = useState(false);

  const { users: _users } = useUsers();
  const setEntityMenuItemRef = useRef<HTMLLIElement>(null);
  const swapBlocksMenuItemRef = useRef<HTMLLIElement>(null);
  const { value: userBlocks } = useUserBlocks();
  const currentComponentId = blockEntity?.properties.componentId as
    | string
    | null;
  const compatibleBlocks = useMemo(() => {
    return Object.values(userBlocks).filter((block) =>
      areComponentsCompatible(currentComponentId, block.meta.componentId),
    );
  }, [currentComponentId, userBlocks]);

  const entityId = blockEntity?.metadata.recordId.entityId ?? null;

  const menuItems = useMemo(() => {
    /** @todo properly type this part of the DraftEntity type https://app.asana.com/0/0/1203099452204542/f */
    const hasChildEntity =
      !!blockEntity?.properties.entity &&
      Object.keys(
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
        (blockEntity.properties.entity as { properties: PropertyObject })
          .properties ?? {},
      ).length > 0;
    const items = [
      ...(currentComponentId && !isHashTextBlock(currentComponentId)
        ? [
            {
              key: "set-entity",
              title: hasChildEntity ? "Swap Entity" : "Add an entity",
              icon: <FontAwesomeIcon icon={faAdd} />,
              subMenu: (
                <LoadEntityMenuContent
                  blockEntityId={entityId}
                  closeParentContextMenu={() => popupState.close()}
                />
              ),
              subMenuWidth: 280,
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
        onClick: () => setEntityEditorOpen(true),
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
    blockEntity,
    currentComponentId,
    entityId,
    deleteBlock,
    openConfigMenu,
    popupState,
    canSwap,
    compatibleBlocks,
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
    if (!blockEntity) {
      return;
    }

    const { recordId, entityTypeId } = blockEntity.blockChildEntity.metadata;
    const newBlockSubgraph = await fetchBlockSubgraph(
      entityTypeId,
      recordId.entityId as EntityId,
    );

    setBlockSubgraph(newBlockSubgraph);
    setEntityEditorOpen(false);
  };

  return (
    <>
      {blockSubgraph && (
        <EditEntityModal
          open={entityEditorOpen}
          onClose={() => setEntityEditorOpen(false)}
          entitySubgraph={
            /** @todo add timeProjection & resolvedTimeProjection properly */
            blockSubgraph as unknown as Subgraph<SubgraphRootTypes["entity"]>
          }
          onSubmit={handleEntityModalSubmit}
        />
      )}
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
             * @todo: re-implement when provenance fields are made available to the frontend
             * @see https://app.asana.com/0/1201095311341924/1203170881776185/f
             */}
            {/* {
            users?.find(
              (account) =>
                account.entityId ===
                blockEntity?.properties.entity.createdByAccountId,
            )?.preferredName
          } */}
          </Typography>
          {/* @todo re-implement after collab works https://app.asana.com/0/0/1203099452204542/f */}
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
