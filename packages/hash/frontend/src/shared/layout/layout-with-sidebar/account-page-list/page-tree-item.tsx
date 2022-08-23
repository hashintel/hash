import { Box, Tooltip, Typography } from "@mui/material";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import { faChevronRight, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { CSSProperties, forwardRef, Ref, useState } from "react";
import { DraggableAttributes } from "@dnd-kit/core";
import { PageIcon } from "../../../../components/PageIcon";
import { Link } from "../../../ui";
import { PageMenu } from "./page-menu";
import { useRouteAccountInfo } from "../../../routing";

export interface PageTreeItemProps {
  id: string;
  title: string;
  url: string;
  depth: number;
  selected: boolean;
  expanded: boolean;
  expandable: boolean;
  collapsed: boolean;
  disabled: boolean;
  onCollapse?: () => void;
  isDragging?: boolean;
  attributes?: DraggableAttributes;
  listeners?: Record<string, Function>;
  style?: CSSProperties;
  wrapperRef?(node: HTMLLIElement): void;
}

export const PageTreeItem = forwardRef(
  (
    {
      id,
      title,
      expandable,
      url,
      depth,
      selected,
      onCollapse,
      expanded,
      collapsed,
      disabled,
      isDragging,
      style,
      attributes,
      listeners,
      wrapperRef,
    }: PageTreeItemProps,
    ref,
  ) => {
    const [hovered, setHovered] = useState(false);

    const { accountId } = useRouteAccountInfo();

    const popupState = usePopupState({
      variant: "popover",
      popupId: "page-menu",
    });

    return !collapsed ? (
      <Box
        ref={wrapperRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Box
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
              : hovered || isDragging
              ? palette.gray[20]
              : "none",
          })}
          ref={ref as Ref<HTMLDivElement>}
          {...attributes}
        >
          <IconButton
            onClick={() => onCollapse?.()}
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
            disabled={disabled}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </IconButton>

          <PageIcon
            hasDarkBg={selected}
            accountId={accountId}
            entityId={id}
            size="small"
          />

          <Link
            noLinkStyle
            tabIndex={-1}
            sx={{
              flex: 1,
              marginLeft: 0.75,
            }}
            href={url}
          >
            <Typography
              variant="smallTextLabels"
              sx={({ palette }) => ({
                display: "block",
                fontWeight: 400,
                py: 1,
                color:
                  palette.gray[selected || hovered || isDragging ? 90 : 70],
              })}
            >
              {title}
            </Typography>
          </Link>

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
                {...listeners}
                {...bindTrigger(popupState)}
                size="medium"
                unpadded
                sx={({ palette }) => ({
                  opacity: selected || hovered || isDragging ? 1 : 0,
                  color: palette.gray[40],
                  "&:focus-visible, &:hover": {
                    backgroundColor: palette.gray[selected ? 40 : 30],
                    color: palette.gray[selected ? 50 : 40],
                  },
                  "&:disabled": {
                    color: palette.gray[40],
                  },
                })}
                disabled={disabled}
              >
                <FontAwesomeIcon icon={faEllipsis} />
              </IconButton>
            </Box>
          </Tooltip>
          <PageMenu popupState={popupState} entityId={id} />
        </Box>
      </Box>
    ) : null;
  },
);
