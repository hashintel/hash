import TreeItem, {
  TreeItemProps,
  useTreeItem,
  TreeItemContentProps,
  treeItemClasses,
} from "@mui/lab/TreeItem";
// import clsx from "clsx";
import { Box, Tooltip, Typography } from "@mui/material";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import {
  faChevronRight,
  faEllipsis,
  faFile,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { forwardRef, MouseEvent, Ref, CSSProperties } from "react";
import { Link } from "../../../ui";
import { PageMenu } from "./page-menu";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DraggableAttributes } from "@dnd-kit/core";

interface ExtraProps {
  attributes?: DraggableAttributes;
  listeners?: Record<string, Function>;
  wrapperRef?(node: HTMLLIElement): void;
}
// tweaked the example at https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
export const PageTreeItem = forwardRef(
  (props: TreeItemContentProps & ExtraProps, ref) => {
    const { label, nodeId, expandable, url, depth } = props;

    const popupState = usePopupState({
      variant: "popover",
      popupId: "page-menu",
    });

    const { expanded, selected, handleExpansion, preventSelection } =
      useTreeItem(nodeId);

    const handleMouseDown = (
      event: MouseEvent<HTMLDivElement, globalThis.MouseEvent>,
    ) => {
      preventSelection(event);
    };

    const handleExpansionClick = (
      event: MouseEvent<HTMLButtonElement, globalThis.MouseEvent>,
    ) => {
      handleExpansion(event);
    };

    return (
      <Box
        ref={props.wrapperRef}
        sx={
          {
            // listStyle: "none",
            // boxSizing: "border-box",
            paddingLeft: `${16 * depth + 8}px`,
            // marginBottom: -1,

            // .TreeItem {
            //   --vertical-padding: 5px;

            //   padding-right: 24px;
            //   border-radius: 4px;
            //   box-shadow: 0px 15px 15px 0 rgba(34, 33, 81, 0.1);
            // }

            // "--spacing": `${indentationWidth * depth}px`,
          } as CSSProperties
        }
      >
        <Box
          tabIndex={0}
          onMouseDown={handleMouseDown}
          sx={({ palette }) => ({
            display: "flex",
            alignItems: "center",
            borderRadius: "4px",

            // pl: `${depth * 16 + 8}px`,
            pr: 0.5,

            ...(!selected && {}),

            "&:hover": {
              ...(!selected && { backgroundColor: palette.gray[20] }),

              "& .page-title": {
                color: palette.gray[80],
              },

              "& .page-menu-trigger": {
                color: palette.gray[40],
              },
            },

            ...(selected && {
              backgroundColor: palette.gray[30],
            }),
          })}
          ref={ref as Ref<HTMLDivElement>}
          style={props.style}
          {...props.attributes}
        >
          <IconButton
            onClick={handleExpansionClick}
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
          <FontAwesomeIcon
            icon={faFile}
            sx={{
              fontSize: 16,
              mr: 1.25,
              color: ({ palette }) => palette.gray[40],
            }}
          />
          <Link
            noLinkStyle
            tabIndex={-1}
            sx={{
              flex: 1,
            }}
            href={url}
          >
            <Typography
              variant="smallTextLabels"
              className="page-title"
              sx={({ palette }) => ({
                display: "block",
                color: palette.gray[70],
                fontWeight: 400,
                py: 1,

                ...(selected && {
                  color: palette.gray[90],
                }),
              })}
            >
              {label}
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
            <IconButton
              {...props.listeners}
              {...bindTrigger(popupState)}
              size="medium"
              unpadded
              className="page-menu-trigger"
              sx={({ palette }) => ({
                color: [selected ? palette.gray[40] : "transparent"],
                "&:focus-visible, &:hover": {
                  backgroundColor: palette.gray[selected ? 40 : 30],
                  color: palette.gray[selected ? 50 : 40],
                },
              })}
            >
              <FontAwesomeIcon icon={faEllipsis} />
            </IconButton>
          </Tooltip>
          <PageMenu popupState={popupState} entityId={nodeId} />
        </Box>
      </Box>
    );
  },
);
