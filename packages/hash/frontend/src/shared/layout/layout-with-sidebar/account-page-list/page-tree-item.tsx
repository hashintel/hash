import { Box, Tooltip, Typography } from "@mui/material";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import { faChevronRight, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { CSSProperties, forwardRef, MouseEvent, Ref, useState } from "react";
import { DraggableAttributes } from "@dnd-kit/core";
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
  createSubPage: (parentPageEntityId: string) => Promise<void>;
  archivePage: (
    value: boolean,
    accountId: string,
    pageEntityId: string,
  ) => Promise<void>;
  onCollapse?: () => void;
  dragProps?: DragProps;
}

const stopEvent = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export const PageTreeItem = forwardRef(
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

    const { accountId } = useRouteAccountInfo();

    const popupState = usePopupState({
      variant: "popover",
      popupId: "page-menu",
    });

    const { isSorting, style, attributes, listeners, wrapperRef } = dragProps;

    const trigger = bindTrigger(popupState);

    return collapsed && isSorting ? null : (
      <Box
        ref={wrapperRef}
        onMouseEnter={() => !isSorting && setHovered(true)}
        onMouseLeave={() => !isSorting && setHovered(false)}
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
            paddingLeft: `${16 * depth + 8}px`,
            paddingRight: 0.5,
            backgroundColor: selected
              ? palette.gray[30]
              : hovered
              ? palette.gray[20]
              : "none",
          })}
          ref={ref as Ref<HTMLAnchorElement>}
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
            {title}
          </Typography>

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
          />
        </Link>
      </Box>
    );
  },
);
