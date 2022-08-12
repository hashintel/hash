import { TreeItemContentProps } from "@mui/lab/TreeItem";
import { Box, Tooltip, Typography } from "@mui/material";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import {
  faChevronRight,
  faEllipsis,
  faFile,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { forwardRef, Ref } from "react";
import { DraggableAttributes } from "@dnd-kit/core";
import { Link } from "../../../ui";
import { PageMenu } from "./page-menu";

interface ExtraProps {
  attributes?: DraggableAttributes;
  listeners?: Record<string, Function>;
  wrapperRef?(node: HTMLLIElement): void;
  onCollapse: () => void;
  selected: boolean;
  expanded: boolean;
  isDragging?: boolean;
}
// tweaked the example at https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
export const PageTreeItem = forwardRef(
  (props: TreeItemContentProps & ExtraProps, ref) => {
    const {
      label,
      nodeId,
      expandable,
      url,
      depth,
      selected,
      onCollapse,
      expanded,
      isDragging,
    } = props;

    const popupState = usePopupState({
      variant: "popover",
      popupId: "page-menu",
    });

    return (
      <Box ref={props.wrapperRef}>
        <Box
          tabIndex={0}
          sx={({ palette, transitions }) => ({
            ...props.style,
            display: "flex",
            alignItems: "center",
            borderRadius: "4px",
            transition: `${transitions.create("padding-left")}; ${
              props.style?.transition
            }`,
            pl: `${16 * depth + 8}px`,

            pr: 0.5,

            ...(!selected &&
              isDragging && {
                ...(!selected && { backgroundColor: palette.gray[20] }),

                "& .page-title": {
                  color: palette.gray[80],
                },

                "& .page-menu-trigger": {
                  color: palette.gray[40],
                },
              }),

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
          {...props.attributes}
        >
          <IconButton
            onClick={() => onCollapse()}
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
          <IconButton
            {...props.listeners}
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
              // {...props.listeners}
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
