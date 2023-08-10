import { CaretDownIcon } from "@hashintel/block-design-system";
import { IconButton } from "@hashintel/design-system";
import {
  Box,
  Collapse,
  ListItem,
  styled,
  SvgIconProps,
  Typography,
  useTheme,
} from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent, useEffect, useState } from "react";

import { Link } from "../../../../shared/ui/link";

export type SidebarItemData = {
  // allow for items to have a conceptual href that doesn't exist but represents their position in the hierarchy
  activeIfHrefStartsWith?: string;
  children?: SidebarItemData[];
  label: string;
  href: string;
  icon?: FunctionComponent<SvgIconProps>;
  parentHref?: string;
};

const ItemLink = styled(Link)<{
  active: boolean;
  color: string;
  level: number;
}>(
  ({ active, color, level }) => `
  color: ${color};
  font-size: ${Math.max(16 - level, 13)}px;
  font-weight: ${level === 2 && active ? 600 : 500};
  text-decoration: none;
  
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`,
);

const SidebarItem = ({
  item,
  level,
}: {
  item: SidebarItemData;
  level: number;
}) => {
  const expandable = !!item.children?.length;

  const router = useRouter();
  const active =
    router.asPath.startsWith(item.href) ||
    (!!item.activeIfHrefStartsWith &&
      router.asPath.startsWith(item.activeIfHrefStartsWith));
  const parentActive =
    item.parentHref && router.asPath.startsWith(item.parentHref);

  const [expanded, setExpanded] = useState(active);

  useEffect(() => {
    const handleRouteChange = (path: string) => {
      if (path.startsWith(item.href)) {
        setExpanded(true);
      } else {
        setExpanded(false);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [item.href, router.events]);

  const theme = useTheme();

  const itemColor = active
    ? level === 2
      ? theme.palette.black
      : theme.palette.primary.main
    : level === 2
    ? theme.palette.gray[70]
    : theme.palette.black;

  const borderColor =
    active || (level > 2 && parentActive)
      ? level === 1
        ? theme.palette.blue[70]
        : theme.palette.blue[20]
      : level === 1
      ? "transparent"
      : theme.palette.gray[20];

  return (
    <>
      <ListItem
        sx={{
          borderLeft: `3px solid ${borderColor}`,
          pl: 2,
          py: 0.5,
          position: "relative",
        }}
      >
        {item.icon ? (
          <item.icon
            sx={{
              fill: itemColor,
              width: "1rem",
              mr: 1.2,
            }}
          />
        ) : (
          <Box width="1rem" mr={1.2} />
        )}
        {level === 3 && active ? (
          <Box
            sx={({ palette }) => ({
              background: palette.blue[70],
              borderRadius: "50%",
              height: 5,
              width: 5,
              position: "absolute",
              left: -4,
            })}
          />
        ) : null}
        <ItemLink
          active={active}
          color={itemColor}
          href={item.href}
          level={level}
        >
          {item.label}
        </ItemLink>
        {expandable && (
          <IconButton
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((isExpanded) => !isExpanded);
            }}
            size="small"
            unpadded
            rounded
            sx={({ transitions }) => ({
              ml: 0.5,
              visibility: "visible",
              pointerEvents: "auto",
              transform: expanded ? "none" : "rotate(-90deg)",
              transition: transitions.create("transform", {
                duration: 300,
              }),
            })}
          >
            <CaretDownIcon
              sx={{
                fill:
                  level === 2 && !active ? theme.palette.gray[40] : itemColor,
              }}
            />
          </IconButton>
        )}
      </ListItem>

      <Collapse in={expanded}>
        {item.children?.map((child) => (
          <SidebarItem key={child.href} item={child} level={level + 1} />
        ))}
      </Collapse>
    </>
  );
};

export const SettingsSidebar = ({
  menuItems,
}: {
  menuItems: SidebarItemData[];
}) => {
  return (
    <Box mr={4} width={200}>
      <Typography
        variant="microText"
        sx={({ palette }) => ({
          color: palette.gray[80],
          display: "block",
          fontWeight: 600,
          letterSpacing: 0.6,
          mb: 2,
          pl: 2,
        })}
      >
        ACCOUNT
      </Typography>
      {menuItems
        .filter((item) => !item.parentHref)
        .map((item) => (
          <SidebarItem key={item.href} item={item} level={1} />
        ))}
    </Box>
  );
};
