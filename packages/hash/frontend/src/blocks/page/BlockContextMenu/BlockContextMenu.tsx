import { areComponentsCompatible } from "@hashintel/hash-shared/blocks";
import { useRef, forwardRef, useMemo, ForwardRefRenderFunction } from "react";

import { useKey } from "rooks";

import { Box, Divider, Typography } from "@mui/material";
import { bindMenu } from "material-ui-popup-state";
import { PopupState } from "material-ui-popup-state/hooks";
import { format } from "date-fns";
import {
  faAdd,
  faArrowRight,
  faGear,
  faLink,
  faMap,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import {
  faCopy,
  faMessage,
  faTrashCan,
} from "@fortawesome/free-regular-svg-icons";
import { BlockEntity } from "@hashintel/hash-shared/entity";

import { Menu, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { useUserBlocks } from "../../userBlocks";
import { getBlockDomId } from "../BlockView";

import { BlockLoaderInput } from "./BlockLoaderInput";
import { useUsers } from "../../../components/hooks/useUsers";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import { LoadEntityMenuContent } from "./LoadEntityMenuContent";
import { BlockListMenuContent } from "./BlockListMenuContent";

type BlockContextMenuProps = {
  blockEntity: BlockEntity | null;
  deleteBlock: () => void;
  openConfigMenu: () => void;
  popupState: PopupState;
  canSwap: boolean;
  toggleShowDataMappingUi: () => void;
};

const BlockContextMenu: ForwardRefRenderFunction<
  HTMLDivElement,
  BlockContextMenuProps
> = (
  {
    blockEntity,
    deleteBlock,
    openConfigMenu,
    popupState,
    canSwap,
    toggleShowDataMappingUi,
  },
  ref,
) => {
  const { data: users } = useUsers();
  const setEntityMenuItemRef = useRef<HTMLLIElement>(null);
  const swapBlocksMenuItemRef = useRef<HTMLLIElement>(null);
  const { value: userBlocks } = useUserBlocks();
  const currentComponentId = blockEntity?.properties.componentId;
  const compatibleBlocks = useMemo(() => {
    return Object.values(userBlocks).filter((block) =>
      areComponentsCompatible(currentComponentId, block.meta.componentId),
    );
  }, [currentComponentId, userBlocks]);

  const entityId = blockEntity?.entityId ?? null;

  const menuItems = useMemo(() => {
    const hasChildEntity =
      Object.keys(blockEntity?.properties.entity.properties ?? {}).length > 0;
    const items = [
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
        key: "map-data",
        title: "Map data",
        icon: <FontAwesomeIcon icon={faMap} />,
        onClick: () => toggleShowDataMappingUi(),
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
    entityId,
    deleteBlock,
    openConfigMenu,
    popupState,
    canSwap,
    compatibleBlocks,
    toggleShowDataMappingUi,
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
          Last edited by {/* @todo use lastedited value when available */}
          {
            users.find(
              (account) =>
                account.entityId ===
                blockEntity?.properties.entity.createdByAccountId,
            )?.name
          }
        </Typography>

        {typeof blockEntity?.properties.entity.updatedAt === "string" && (
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
        )}
      </Box>
    </Menu>
  );
};

const BlockContextMenuForwardedRef = forwardRef(BlockContextMenu);

export { BlockContextMenuForwardedRef as BlockContextMenu };
