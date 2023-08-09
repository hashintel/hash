import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Box, ListItem } from "@mui/material";
import { ReactElement, useState } from "react";

import { Link } from "../../../../shared/ui/link";

export type MenuItem = {
  label: string;
  href: string;
  icon?: ReactElement;
  parentHref?: string;
};

export type MenuItemWithChildren = MenuItem & {
  children: MenuItemWithChildren[];
};

const SidebarItem = ({ item }: { item: MenuItemWithChildren }) => {
  const expandable = !!item.children.length;
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <ListItem>
        <Link href={item.href}>{item.label}</Link>
        {expandable && (
          <IconButton
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((isExpanded) => !isExpanded);
            }}
            size="xs"
            unpadded
            rounded
            sx={({ transitions }) => ({
              mr: 0.5,

              visibility: "visible",
              pointerEvents: "auto",
              transform: expanded ? `rotate(90deg)` : "none",
              transition: transitions.create("transform", {
                duration: 300,
              }),
            })}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </IconButton>
        )}
      </ListItem>
      {expanded && (
        <Box ml={1}>
          {item.children.map((child) => (
            <SidebarItem key={child.href} item={child} />
          ))}
        </Box>
      )}
    </>
  );
};

export const SettingsSidebar = ({
  menuItems,
}: {
  menuItems: MenuItemWithChildren[];
}) => {
  return (
    <Box mr={4}>
      {menuItems
        .filter((item) => !item.parentHref)
        .map((item) => (
          <SidebarItem key={item.href} item={item} />
        ))}
    </Box>
  );
};
