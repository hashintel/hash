import { DraggableAttributes } from "@dnd-kit/core";
import { faChevronRight, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { EntityId } from "@hashintel/hash-shared/types";
import { Box, PopoverPosition, Tooltip, Typography } from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { CSSProperties, forwardRef, MouseEvent, useState } from "react";

import { PAGE_TITLE_PLACEHOLDER } from "../../../../blocks/page/page-title/page-title";
import { PageIconButton } from "../../../../components/page-icon-button";
import { Link } from "../../../ui";
import { PageMenu } from "./page-menu";

interface DragProps {
  isSorting?: boolean;
  attributes?: DraggableAttributes;
  listeners?: Record<string, Function>;
  style?: CSSProperties;
  wrapperRef?(this: void, node: HTMLLIElement): void;
}
export interface PageTreeItemProps {
  pageEntityId: EntityId;
  title: string;
  pagePath: string;
  depth: number;
  selected: boolean;
  expanded: boolean;
  expandable: boolean;
  collapsed: boolean;
  createSubPage: () => Promise<void>;
  archivePage: (value: boolean, pageEntityId: EntityId) => Promise<void>;
  onCollapse?: () => void;
  dragProps?: DragProps;
}

export const IDENTATION_WIDTH = 16;

const stopEvent = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export const PageTreeItem = forwardRef<HTMLAnchorElement, PageTreeItemProps>(
  (
    {
      pageEntityId,
      title,
      expandable,
      pagePath,
      depth,
      selected,
      createSubPage,
      archivePage,
      onCollapse,
      expanded,
      collapsed,
      dragProps = {},
    }: PageTreeItemProps,
    ref,
  ) => {
    const [hovered, setHovered] = useState(false);
    const [anchorPosition, setAnchorPosition] = useState<PopoverPosition>();

    const popupState = usePopupState({
      variant: "popover",
      popupId: "page-menu",
    });

    const { isSorting, style, attributes, listeners, wrapperRef } = dragProps;

    const trigger = bindTrigger(popupState);

    const setHoveredState = (value: boolean) => {
      if (!isSorting) {
        setHovered(value);
      }
    };

    return collapsed && isSorting ? null : (
      <Box
        ref={wrapperRef}
        onContextMenu={(event) => {
          event.preventDefault();
          if (popupState.isOpen) {
            setAnchorPosition(undefined);
            return popupState.close();
          }
          setAnchorPosition({
            left: event.clientX + 2,
            top: event.clientY - 6,
          });
          popupState.open(event);
        }}
        onMouseEnter={() => setHoveredState(true)}
        onMouseLeave={() => setHoveredState(false)}
      >
        <Link
          noLinkStyle
          href={pagePath}
          tabIndex={0}
          sx={({ palette, transitions }) => ({
            ...style,
            display: "flex",
            alignItems: "center",
            borderRadius: "4px",
            transition: `${transitions.create("padding-left", {
              duration: 200,
              easing: "ease",
            })}, ${style?.transition}`,
            paddingLeft: `${IDENTATION_WIDTH * depth + 8}px`,
            paddingRight: 0.5,
            backgroundColor: selected
              ? palette.gray[30]
              : hovered
              ? palette.gray[20]
              : "none",
          })}
          ref={ref}
          {...listeners}
          {...attributes}
        >
          <IconButton
            onClick={(event) => {
              stopEvent(event);
              onCollapse?.();
            }}
            size="xs"
            unpadded
            rounded
            sx={({ transitions }) => ({
              visibility: "hidden",
              pointerEvents: "none",
              mr: 0.5,

              ...(expandable && {
                visibility: "visible",
                pointerEvents: "auto",
                transform: expanded ? `rotate(90deg)` : "none",
                transition: transitions.create("transform", { duration: 300 }),
              }),
            })}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </IconButton>

          <PageIconButton
            hasDarkBg={selected}
            entityId={pageEntityId}
            size="small"
            onClick={stopEvent}
            popoverProps={{ onClick: stopEvent }}
          />

          <Tooltip
            title={title || PAGE_TITLE_PLACEHOLDER}
            placement="right"
            disableInteractive
            enterDelay={500}
            enterNextDelay={300}
            componentsProps={{
              tooltip: {
                sx: { ml: "32px !important" },
              },
            }}
          >
            <Typography
              variant="smallTextLabels"
              sx={({ palette }) => ({
                display: "block",
                fontWeight: 400,
                marginLeft: 0.75,
                py: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                color: palette.gray[selected || hovered ? 90 : 70],
              })}
            >
              {title || PAGE_TITLE_PLACEHOLDER}
            </Typography>
          </Tooltip>

          <Tooltip
            title="Add subpages, delete, duplicate and more"
            componentsProps={{
              tooltip: {
                sx: {
                  width: 175,
                },
              },
            }}
          >
            <Box>
              <IconButton
                {...trigger}
                onClick={(event) => {
                  stopEvent(event);
                  trigger.onClick(event);
                }}
                size="medium"
                unpadded
                sx={({ palette }) => ({
                  marginLeft: "auto",
                  opacity: selected || hovered ? 1 : 0,
                  color: palette.gray[40],
                  "&:focus-visible, &:hover": {
                    backgroundColor: palette.gray[selected ? 40 : 30],
                    color: palette.gray[selected ? 50 : 40],
                  },
                })}
              >
                <FontAwesomeIcon icon={faEllipsis} />
              </IconButton>
            </Box>
          </Tooltip>
          <PageMenu
            entityId={pageEntityId}
            popupState={popupState}
            createSubPage={createSubPage}
            archivePage={archivePage}
            /**
             * we reset anchor position on close because,
             * maybe next time user can open via clicking the `more` icon instead of right-clicking again
             */
            onClose={() => setAnchorPosition(undefined)}
            anchorPosition={anchorPosition}
            pagePath={pagePath}
          />
        </Link>
      </Box>
    );
  },
);
