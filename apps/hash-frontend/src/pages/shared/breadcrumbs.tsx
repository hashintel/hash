import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import {
  Box,
  Breadcrumbs as MuiBreadcrumbs,
  ListItemIcon,
  ListItemText,
  Menu,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

import { Button, MenuItem } from "../../shared/ui";
import { PAGE_TITLE_PLACEHOLDER } from "./block-collection/page-title/page-title";

export type Breadcrumb = {
  title: string;
  href?: string;
  icon?: ReactNode | null;
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
            <ListItemText>{item.title || "Untitled"}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export type BreadcrumbsProps = {
  crumbs: Breadcrumb[];
  defaultIcon?: ReactNode;
  scrollToTop: () => void;
};

export const Breadcrumbs = ({
  crumbs,
  defaultIcon,
  scrollToTop,
}: BreadcrumbsProps) => {
  const router = useRouter();
  let items: (Breadcrumb | { submenu: Breadcrumb[] })[] = crumbs;

  if (crumbs.length > 4) {
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
        if (item && "submenu" in item) {
          return (
            <SubMenu
              key={item.submenu.map((submenuItem) => submenuItem.id).join("-")}
              items={item.submenu}
              defaultIcon={defaultIcon}
            />
          );
        }

        let maxLength = 18;
        if (items.length === 1 || index !== 0) {
          maxLength = 36;
        }

        return (
          <Box key={item.title}>
            <Button
              disabled={!item.href}
              variant="tertiary_quiet"
              // don't attach href if it's the current page
              {...(item.href &&
                !item.href.includes(router.asPath) && { href: item.href })}
              onClick={() => {
                if (item.href?.includes(router.asPath)) {
                  scrollToTop();
                }
              }}
              size="xs"
              startIcon={
                item.icon === null ? undefined : (item.icon ?? defaultIcon)
              }
              sx={{
                background: "transparent",
                "&:disabled": {
                  background: "transparent",
                  borderColor: "transparent",
                  color: "inherit",
                },
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
                {item.title || PAGE_TITLE_PLACEHOLDER}
              </Box>
            </Button>
          </Box>
        );
      })}
    </MuiBreadcrumbs>
  );
};
