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
// import { Button } from "../../../Button";
import { Link } from "../../../Link";
import { PageMenu } from "./PageMenu";

type CustomContentProps = TreeItemContentProps & {
  expandable?: boolean;
  pageUrl: string;
  depth: number;
};

// inspiration gotten from https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
const CustomContent = React.forwardRef((props: CustomContentProps, ref) => {
  const { label, nodeId, expandable, pageUrl, depth } = props;
  const [hovered, setHovered] = React.useState(false);
  const pageMenuTriggerRef = React.useRef(null);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "page-menu",
  });

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
        borderRadius: "4px",

        pl: `${depth * 15 + 8}px`,
        pr: 1,

        ...((hovered || focused) &&
          !selected && {
            backgroundColor: ({ palette }) => palette.gray[20],
          }),

        ...(selected && {
          backgroundColor: ({ palette }) => palette.gray[30],
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
        size="xs"
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
          ref={pageMenuTriggerRef}
          {...bindTrigger(popupState)}
          size="medium"
          unpadded
          sx={{
            color: ({ palette }) => palette.gray[40],
            ...(hovered && {
              backgroundColor: ({ palette }) =>
                palette.gray[selected ? 40 : 30],
              color: ({ palette }) => palette.gray[50],
            }),
            "&:hover": {
              backgroundColor: ({ palette }) =>
                palette.gray[selected ? 40 : 30],
              color: ({ palette }) => palette.gray[50],
            },
          }}
        >
          <FontAwesomeIcon icon={faEllipsis} />
        </IconButton>
      </Tooltip>
      <PageMenu popupState={popupState} />
    </Box>
  );
});

export const PageTreeItem = ({
  sx,
  // depth,
  ...props
}: TreeItemProps & { depth: number }) => {
  // console.log("depth passed to component ==> ", depth);
  // Figure out why depth doesn't update with the right value
  return (
    <TreeItem
      {...props}
      sx={{
        ...sx,
        // uncommenting this resets TreeItems default styles
        [`& .${treeItemClasses.group}`]: {
          marginLeft: 0,
          // [`& .${treeItemClasses.content}`]: {
          //   pl: `${depth * 15 + 8}px`,
          //   pr: 1,
          // },
        },
      }}
      ContentComponent={CustomContent}
    />
  );
};
