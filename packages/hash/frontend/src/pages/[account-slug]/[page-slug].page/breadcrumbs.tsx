import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
  Menu,
  MenuItem,
} from "@hashintel/hash-design-system";
import {
  Breadcrumbs as MuiBreadcrumbs,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

export type BreadcrumbsProps = {
  crumbs: {
    title?: string;
    href?: string;
  }[];
};

const shortenText = (text: string, max: number) => {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const SubMenu = () => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "submenu",
  });

  return (
    <>
      <IconButton size="small" unpadded {...bindTrigger(popupState)}>
        …
      </IconButton>
      <Menu
        {...bindMenu(popupState)}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
      >
        <MenuItem>
          <ListItemIcon>🎄</ListItemIcon>
          <ListItemText>Some random Stuff</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export const Breadcrumbs = ({ crumbs }) => {
  let items = [];

  if (crumbs.length > 3) {
    items = [
      crumbs[0],
      {
        type: "submenu",
        items: crumbs.slice(1, -1),
      },
      crumbs[crumbs.length - 1],
    ];
  } else {
    items = crumbs;
  }

  console.log({ items });

  return (
    <MuiBreadcrumbs
      separator={
        <FontAwesomeIcon
          icon={faAngleRight}
          sx={({ palette }) => ({ fontSize: 14, color: palette.gray[50] })}
        />
      }
    >
      {items.map((item, index) => {
        if (item?.type === "submenu") {
          return <SubMenu />;
        }
        return (
          <Tooltip
            placement="bottom-start"
            key={item.title}
            title={item.title}
            componentsProps={{ tooltip: { sx: { mt: "0px !important" } } }}
          >
            <Button
              variant="tertiary_quiet"
              size="xs"
              startIcon={<>🎄</>}
              sx={{
                px: 1,
              }}
            >
              {shortenText(item.title, index === 0 ? 18 : 36)}
            </Button>
          </Tooltip>
        );
      })}
    </MuiBreadcrumbs>
  );
};
