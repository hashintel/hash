import * as React from "react";
import TreeItem, {
  TreeItemProps,
  useTreeItem,
  TreeItemContentProps,
} from "@mui/lab/TreeItem";
// import clsx from "clsx";
import { Box, IconButton, Typography } from "@mui/material";
import { faChevronRight, faFile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeSvgIcon } from "../../../icons";

type CustomContentProps = TreeItemContentProps & { hasChildren?: boolean };

// inspiration gotten from https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
const CustomContent = React.forwardRef((props: CustomContentProps, ref) => {
  const { label, nodeId, hasChildren } = props;

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
      ref={ref as React.Ref<HTMLDivElement>}
      sx={{
        display: "flex",
        alignItems: "center",
        px: 1,

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
            // @todo-mui add focus styles
          }),
      }}
    >
      <IconButton
        onClick={handleExpansionClick}
        sx={{
          visibility: "hidden",
          pointerEvents: "none",
          height: 20,
          width: 20,
          mr: 0.5,

          ...(hasChildren && {
            visibility: "visible",
            pointerEvents: "auto",

            transform: expanded ? `rotate(90deg)` : "none",
            transition: ({ transitions }) =>
              transitions.create("transform", { duration: 300 }),
          }),
        }}
      >
        <FontAwesomeSvgIcon icon={faChevronRight} sx={{ fontSize: 12 }} />
      </IconButton>
      <FontAwesomeSvgIcon
        icon={faFile}
        sx={{
          fontSize: 16,
          mr: 1,
          color: ({ palette }) => palette.gray[50],
        }}
      />
      {/* @todo-mui this should be switched to our button component once we have all variants implemented */}
      <Box
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
      </Box>
    </Box>
  );
});

export const PageTreeItem = (
  props: TreeItemProps & { hasChildren?: boolean },
) => {
  const { hasChildren, ...otherProps } = props;

  return (
    <TreeItem
      ContentComponent={CustomContent}
      {...otherProps}
      ContentProps={{
        // @ts-expect-error -- can't seem to override TreeItemProps at the moment, plan to revisit
        hasChildren,
      }}
    />
  );
};
