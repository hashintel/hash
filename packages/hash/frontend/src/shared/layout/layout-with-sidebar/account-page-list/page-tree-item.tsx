import { Box, PopoverPosition, Tooltip, Typography } from "@mui/material";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import { faChevronRight, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { CSSProperties, forwardRef, MouseEvent, useState } from "react";
import { DraggableAttributes } from "@dnd-kit/core";
import { PAGE_TITLE_PLACEHOLDER } from "../../../../blocks/page/PageTitle/PageTitle";
import { PageIconButton } from "../../../../components/PageIconButton";
import { Link } from "../../../ui";
import { PageMenu } from "./page-menu";
import { useRouteAccountInfo } from "../../../routing";

interface DragProps {
  isSorting?: boolean;
  attributes?: DraggableAttributes;
  listeners?: Record<string, Function>;
  style?: CSSProperties;
  wrapperRef?(node: HTMLLIElement): void;
}
export interface PageTreeItemProps {
  id: string;
  title: string;
  url: string;
  depth: number;
  selected: boolean;
  expanded: boolean;
  expandable: boolean;
  collapsed: boolean;
  createSubPage: () => Promise<void>;
  archivePage: (
    value: boolean,
    accountId: string,
    pageEntityId: string,
  ) => Promise<void>;
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
      id,
      title,
      expandable,
      url,
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

    const { accountId } = useRouteAccountInfo();

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
          if (popupState.isOpen) {
            setAnchorPosition(undefined);
            return popupState.close();
          }
          event.preventDefault();
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
          href={url}
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
            accountId={accountId}
            entityId={id}
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
            entityId={id}
            popupState={popupState}
            createSubPage={createSubPage}
            archivePage={archivePage}
            /**
             * we reset anchor position on close because,
             * maybe next time user can open via clicking the `more` icon instead of right-clicking again
             */
            onClose={() => setAnchorPosition(undefined)}
            anchorPosition={anchorPosition}
          />
        </Link>
      </Box>
    );
  },
);
