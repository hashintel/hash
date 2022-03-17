import * as React from "react";
import TreeItem, {
  TreeItemProps,
  useTreeItem,
  TreeItemContentProps,
  treeItemClasses,
} from "@mui/lab/TreeItem";
// import clsx from "clsx";
import { Box, Typography } from "@mui/material";
import {
  faChevronRight,
  faEllipsis,
  faFile,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "../../../icons";
import { IconButton } from "../../../IconButton";
// import { Button } from "../../../Button";
import { Link } from "../../../Link";

type CustomContentProps = TreeItemContentProps & {
  expandable?: boolean;
  pageUrl: string;
};

// inspiration gotten from https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
const CustomContent = React.forwardRef((props: CustomContentProps, ref) => {
  const { label, nodeId, expandable, pageUrl } = props;
  const [hovered, setHovered] = React.useState(false);

  const {
    expanded,
    selected,
    focused,
    handleExpansion,
    handleSelection,
    preventSelection,
  } = useTreeItem(nodeId);

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

  const handleSelectionClick = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    handleSelection(event);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <Box
      onMouseDown={handleMouseDown}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      ref={ref as React.Ref<HTMLDivElement>}
      sx={{
        display: "flex",
        alignItems: "center",
        // pr: 1,

        "&:hover": {
          backgroundColor: ({ palette }) => palette.gray[20],
          borderRadius: "4px",
        },

        ...(selected && {
          backgroundColor: ({ palette }) => palette.gray[20],
          borderRadius: "4px",
        }),

        ...(focused &&
          {
            // backgroundColor: "red !important"
            // @todo-mui add focus styles
          }),
      }}
    >
      <IconButton
        onClick={handleExpansionClick}
        size="small"
        unpadded
        rounded
        sx={{
          visibility: "hidden",
          pointerEvents: "none",
          mr: 0.5,

          ...(expandable && {
            visibility: "visible",
            pointerEvents: "auto",

            transform: expanded ? `rotate(90deg)` : "none",
            transition: ({ transitions }) =>
              transitions.create("transform", { duration: 300 }),
          }),
        }}
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
      {/* @todo-mui this should be switched to our button component once we have all variants implemented */}
      <Link
        noLinkStyle
        sx={{
          flex: 1,
          width: "100%",
          outline: "none",
          textAlign: "left",
        }}
        href={pageUrl}
      >
        <Typography
          variant="smallTextLabels"
          sx={{
            display: "block",
            color: ({ palette }) => palette.gray[70],
            py: 1,
          }}
        >
          {label}
        </Typography>
      </Link>

      {/* <Box
        component="button"
        onClick={handleSelectionClick}
        sx={{
          flex: 1,
          width: "100%",
          outline: "none",
          textAlign: "left",
        }}
      >
        <Typography
          variant="smallTextLabels"
          sx={{
            display: "block",
            color: ({ palette }) => palette.gray[70],
            py: 1,
          }}
        >
          {label}
        </Typography>
      </Box> */}
      <IconButton
        size="medium"
        unpadded
        sx={{
          color: ({ palette }) => palette.gray[40],
          ...((hovered || selected) && {
            color: ({ palette }) => palette.gray[50],
          }),
          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[30],
            color: ({ palette }) => palette.gray[50],
          },
        }}
      >
        <FontAwesomeIcon icon={faEllipsis} />
      </IconButton>
    </Box>
  );
});

export const PageTreeItem = ({
  sx,
  depth,
  ...props
}: TreeItemProps & { depth: number }) => {
  // console.log("depth page ==> ", depth);
  // Figure out why depth doesn't update with the right value
  return (
    <TreeItem
      {...props}
      sx={{
        ...sx,
        [`& .${treeItemClasses.group}`]: {
          marginLeft: 0,
          [`& .${treeItemClasses.content}`]: {
            pl: `${depth * 15 + 8}px`,
            pr: 1,
          },
        },
      }}
      ContentComponent={CustomContent}
    />
  );
};
