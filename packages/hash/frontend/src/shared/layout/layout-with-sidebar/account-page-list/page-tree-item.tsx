import TreeItem, {
  TreeItemProps,
  useTreeItem,
  TreeItemContentProps,
  treeItemClasses,
} from "@mui/lab/TreeItem";
// import clsx from "clsx";
import { Box, Tooltip, Typography } from "@mui/material";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import { faChevronRight, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { forwardRef, MouseEvent, Ref } from "react";
import { PageIconButton } from "../../../../components/PageIconButton";
import { Link } from "../../../ui";
import { PageMenu } from "./page-menu";
import { useRouteAccountInfo } from "../../../routing";

// tweaked the example at https://mui.com/components/tree-view/#IconExpansionTreeView.tsx
const CustomContent = forwardRef((props: TreeItemContentProps, ref) => {
  const { label, nodeId, expandable, url, depth } = props;
  const { accountId } = useRouteAccountInfo();
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
      component={Link}
      noLinkStyle
      href={url}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      ref={ref as Ref<HTMLDivElement>}
      sx={({ palette }) => ({
        display: "flex",
        alignItems: "center",
        borderRadius: "4px",

        pl: `${depth * 16 + 8}px`,
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
      <PageIconButton
        hasDarkBg={selected}
        accountId={accountId}
        entityId={nodeId}
        size="small"
      />
      <Typography
        variant="smallTextLabels"
        className="page-title"
        sx={({ palette }) => ({
          ml: "6px",
          display: "block",
          color: palette.gray[70],
          fontWeight: 400,
          py: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          ...(selected && {
            color: palette.gray[90],
          }),
        })}
      >
        {label}
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
        <IconButton
          {...bindTrigger(popupState)}
          size="medium"
          unpadded
          className="page-menu-trigger"
          sx={({ palette }) => ({
            ml: "auto",
            color: [selected ? palette.gray[40] : "transparent"],
            "&:focus-visible, &:hover": {
              backgroundColor: palette.gray[selected ? 40 : 30],
              color: `${palette.gray[selected ? 50 : 40]} !important`,
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
