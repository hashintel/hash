import * as React from "react";
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
import { FontAwesomeIcon } from "../../../icons";
import { IconButton } from "../../../IconButton";
import { Link } from "../../../Link";
import { PageMenu } from "./PageMenu";

// tweaked the example at https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
const CustomContent = React.forwardRef((props: TreeItemContentProps, ref) => {
  const { label, nodeId, expandable, url, depth } = props;
  const popupState = usePopupState({
    variant: "popover",
    popupId: "page-menu",
  });

  const { expanded, selected, handleExpansion, preventSelection } =
    useTreeItem(nodeId);

  const handleMouseDown = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    preventSelection(event);
  };

  const handleExpansionClick = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    handleExpansion(event);
  };

  return (
    <Box
      tabIndex={0}
      onMouseDown={handleMouseDown}
      ref={ref as React.Ref<HTMLDivElement>}
      sx={({ palette }) => ({
        display: "flex",
        alignItems: "center",
        borderRadius: "4px",

        pl: `${depth * 15 + 8}px`,
        pr: 1,

        ...(!selected && {}),

        "&:hover": {
          ...(!selected && { backgroundColor: palette.gray[20] }),

          "& .page-title": {
            color: palette.gray[80],
          },

          "& .page-menu-trigger": {
            color: palette.gray[50],
          },
        },

        ...(selected && {
          backgroundColor: palette.gray[30],
        }),
      })}
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
          mr: 1,
          color: ({ palette }) => palette.gray[50],
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
          {...bindTrigger(popupState)}
          size="medium"
          unpadded
          className="page-menu-trigger"
          sx={({ palette }) => ({
            color: palette.gray[40],
            "&:hover": {
              backgroundColor: palette.gray[selected ? 40 : 30],
              color: palette.gray[50],
            },
          })}
        >
          <FontAwesomeIcon icon={faEllipsis} />
        </IconButton>
      </Tooltip>
      <PageMenu popupState={popupState} entityId={nodeId} />
    </Box>
  );
});

export const PageTreeItem = ({
  sx = [],
  ...props
}: TreeItemProps & { depth: number }) => {
  return (
    <TreeItem
      {...props}
      sx={[
        {
          // resets the default margin applied to a TreeItem's child(ren)
          // we apply a padding instead to the CustomComponent
          // this makes it possible for the hover background to span the entire sidebar width
          [`& .${treeItemClasses.group}`]: {
            marginLeft: 0,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      ContentComponent={CustomContent}
    />
  );
};
