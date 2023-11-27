import { CaretDownSolidIcon, IconButton } from "@hashintel/design-system";
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
import { FunctionComponent, useCallback, useEffect, useState } from "react";

import { Link } from "../../../../shared/ui/link";

export type SidebarItemData = {
  // allow for items to have a conceptual href that doesn't exist but represents their position in the hierarchy
  activeIfPathStartsWith?: string;
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
  expandedItemHrefs,
  setItemExpanded,
  item,
  lastChild,
  level,
}: {
  expandedItemHrefs: string[];
  item: SidebarItemData;
  lastChild: boolean;
  level: number;
  setItemExpanded: (item: SidebarItemData, shouldExpand: boolean) => void;
}) => {
  const expandableViaButtton = level > 1 && !!item.children?.length;

  const router = useRouter();
  const active =
    router.asPath.startsWith(item.href) ||
    (!!item.activeIfPathStartsWith &&
      router.asPath.startsWith(item.activeIfPathStartsWith));

  const parentActive =
    item.parentHref && router.asPath.startsWith(item.parentHref);

  const expanded = expandedItemHrefs.includes(item.href);

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

  const paddingLevels: Record<number, number> = {
    1: 0.5,
    2: 0.4,
    3: 0.2,
  };

  return (
    <>
      <ListItem
        sx={{
          borderLeft: `3px solid ${borderColor}`,
          pl: 2,
          py: paddingLevels[level],
          pb: lastChild ? paddingLevels[Math.max(1, level - 1)] : undefined,
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
          <Box width="1rem" minWidth="1rem" mr={1.2} />
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
        {expandableViaButtton && (
          <IconButton
            onClick={(event) => {
              event.stopPropagation();
              setItemExpanded(item, !expanded);
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
            <CaretDownSolidIcon
              sx={{
                fill:
                  level === 2 && !active ? theme.palette.gray[40] : itemColor,
              }}
            />
          </IconButton>
        )}
      </ListItem>

      <Collapse in={expanded}>
        {item.children?.map((child, index) => (
          <SidebarItem
            expandedItemHrefs={expandedItemHrefs}
            setItemExpanded={setItemExpanded}
            key={child.href}
            item={child}
            level={level + 1}
            lastChild={index === item.children!.length - 1}
          />
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
  const router = useRouter();

  const rootItems = menuItems.filter((item) => !item.parentHref);

  const findItemAndParentsHrefs = useCallback(
    (item: SidebarItemData) => {
      const itemAndParents = [item];
      do {
        const parent =
          itemAndParents[0]!.parentHref &&
          menuItems.find((itemOption) =>
            [itemOption.href, itemOption.activeIfPathStartsWith].includes(
              itemAndParents[0]!.parentHref,
            ),
          );
        if (parent) {
          itemAndParents.unshift(parent);
        }
      } while (itemAndParents[0]!.parentHref);
      return itemAndParents.map((itemOption) => itemOption.href);
    },
    [menuItems],
  );

  const [expandedItemHrefs, setExpandedItemHrefs] = useState<string[]>(() => {
    const activeItem = menuItems.find(
      (item) =>
        router.asPath === item.href ||
        (item.activeIfPathStartsWith &&
          router.asPath.startsWith(item.activeIfPathStartsWith)),
    );

    return activeItem ? findItemAndParentsHrefs(activeItem) : [];
  });

  const setItemExpansion = useCallback(
    (itemToChange: SidebarItemData, shouldExpand: boolean) => {
      setExpandedItemHrefs((currentlyExpandedItems) => {
        if (shouldExpand) {
          return findItemAndParentsHrefs(itemToChange);
        } else {
          return currentlyExpandedItems.filter((i) => i !== itemToChange.href);
        }
      });
    },
    [findItemAndParentsHrefs],
  );

  const handlePathChange = useCallback(
    (path: string) => {
      const activeItem = menuItems.find(
        (item) =>
          path === item.href ||
          (item.activeIfPathStartsWith &&
            path.startsWith(item.activeIfPathStartsWith)),
      );

      if (activeItem) {
        setExpandedItemHrefs(findItemAndParentsHrefs(activeItem));
      }
    },
    [findItemAndParentsHrefs, menuItems],
  );

  useEffect(() => {
    router.events.on("routeChangeComplete", handlePathChange);

    return () => {
      router.events.off("routeChangeComplete", handlePathChange);
    };
  }, [handlePathChange, router.events]);

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
      {rootItems.map((item, index) => (
        <SidebarItem
          expandedItemHrefs={expandedItemHrefs}
          setItemExpanded={setItemExpansion}
          key={item.href}
          item={item}
          level={1}
          lastChild={index === menuItems.length - 1}
        />
      ))}
    </Box>
  );
};
