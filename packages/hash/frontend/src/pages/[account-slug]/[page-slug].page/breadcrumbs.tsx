import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
  Menu,
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
import { ReactNode } from "react";
import { MenuItem } from "../../../shared/ui";

type Breadcrumb = {
  title: string;
  href: string;
  icon?: ReactNode;
};

const shortenText = (text: string, max: number) => {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

type SubMenuProps = {
  items: Breadcrumb[];
  defaultIcon: ReactNode;
};

const SubMenu = ({ items, defaultIcon }: SubMenuProps) => {
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
        {items.map((item) => (
          <MenuItem href={item.href} key={item.title}>
            <ListItemIcon>{item.icon ?? defaultIcon}</ListItemIcon>
            <ListItemText>{item.title}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export type BreadcrumbsProps = {
  crumbs: Breadcrumb[];
  defaultIcon?: ReactNode;
};

export const Breadcrumbs = ({ crumbs, defaultIcon }: BreadcrumbsProps) => {
  let items = [] as (Breadcrumb | { submenu: Breadcrumb[] })[];

  if (crumbs.length > 3) {
    items = [
      crumbs[0]!,
      {
        submenu: crumbs.slice(1, -1),
      },
      crumbs[crumbs.length - 1]!,
    ];
  } else {
    items = crumbs;
  }

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
        if ("submenu" in item) {
          return <SubMenu items={item.submenu} defaultIcon={defaultIcon} />;
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
              startIcon={defaultIcon}
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
