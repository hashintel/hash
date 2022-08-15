import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
  Menu,
} from "@hashintel/hash-design-system";
import {
  Box,
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
import { useRouter } from "next/router";
import { ReactNode } from "react";
import { MenuItem } from "../../shared/ui";

export type Breadcrumb = {
  title: string;
  href: string;
  icon?: ReactNode;
  id: string;
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
  const router = useRouter();
  let items: (Breadcrumb | { submenu: Breadcrumb[] })[] = crumbs;

  if (crumbs.length > 3) {
    items = [
      crumbs[0]!,
      {
        submenu: crumbs.slice(1, -1),
      },
      crumbs[crumbs.length - 1]!,
    ];
  }

  return (
    <MuiBreadcrumbs
      separator={
        <FontAwesomeIcon
          icon={faAngleRight}
          sx={({ palette }) => ({
            fontSize: 14,
            color: palette.gray[50],
            mx: 0,
          })}
        />
      }
    >
      {items.map((item, index) => {
        if (item && "submenu" in item) {
          return <SubMenu items={item.submenu} defaultIcon={defaultIcon} />;
        }

        let maxLength = 18;
        if (items.length === 1 || index !== 0) {
          maxLength = 36;
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
              // don't attach href if it's the current page
              {...(!item.href.includes(router.asPath) && { href: item.href })}
              size="xs"
              startIcon={item.icon ?? defaultIcon}
              sx={{
                px: 1,
              }}
            >
              <Box
                component="span"
                sx={{
                  maxWidth: `${maxLength}ch`,
                  whiteSpace: "nowrap",
                  overflowX: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.title}
              </Box>
            </Button>
          </Tooltip>
        );
      })}
    </MuiBreadcrumbs>
  );
};
