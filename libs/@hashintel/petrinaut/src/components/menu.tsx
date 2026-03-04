import { Menu as ArkMenu } from "@ark-ui/react";
import { Portal } from "@ark-ui/react/portal";
import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

import { usePortalContainerRef } from "../state/portal-container-context";

// -- Styles (Figma: Menu component) ------------------------------------------

const menuContentStyle = cva({
  base: {
    backgroundColor: "neutral.s00",
    borderRadius: "xl",
    boxShadow:
      "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 4px 4px -12px rgba(0, 0, 0, 0.02), 0px 12px 12px -6px rgba(0, 0, 0, 0.02)]",
    minWidth: "[180px]",
    overflow: "hidden",
  },
  variants: {
    animated: {
      true: {
        transformOrigin: "var(--transform-origin)",
        '&[data-state="open"]': {
          animation: "popover-in 150ms ease-out",
        },
        '&[data-state="closed"]': {
          animation: "popover-out 100ms ease-in",
        },
      },
    },
  },
});

const submenuContentStyle = css({
  backgroundColor: "neutral.s00",
  borderRadius: "xl",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 4px 4px -12px rgba(0, 0, 0, 0.02), 0px 12px 12px -6px rgba(0, 0, 0, 0.02)]",
  minWidth: "[180px]",
  overflow: "hidden",
  zIndex: 2,
  transformOrigin: "var(--transform-origin)",
  '&[data-state="open"]': {
    animation: "popover-in 150ms ease-out",
  },
  '&[data-state="closed"]': {
    animation: "popover-out 100ms ease-in",
  },
});

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  padding: "1",
});

const groupTitleStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingLeft: "2",
  paddingRight: "2",
  paddingBlock: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  textTransform: "uppercase",
  letterSpacing: "[0.48px]",
  lineHeight: "[12px]",
});

const groupItemsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
});

const separatorStyle = css({
  height: "[1px]",
  backgroundColor: "neutral.s20",
});

const itemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    minHeight: "[32px]",
    minWidth: "[130px]",
    padding: "2",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "[14px]",
    color: "neutral.s120",
    cursor: "pointer",
    _hover: {
      backgroundColor: "neutral.s10",
    },
    _disabled: {
      opacity: "[0.4]",
      cursor: "not-allowed",
      _hover: {
        backgroundColor: "[transparent]",
      },
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.s20",
        color: "[#3b82f6]",
        _hover: {
          backgroundColor: "blue.s20",
        },
      },
    },
    destructive: {
      true: {
        color: "red.s60",
      },
    },
  },
});

const itemIconStyle = css({
  flexShrink: 0,
  width: "3.5",
  height: "3.5",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const itemLabelStyle = css({
  flex: "[1]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const itemDescriptionStyle = css({
  fontSize: "xs",
  fontWeight: "normal",
  lineHeight: "[1.5]",
  color: "neutral.s100",
});

const itemSuffixStyle = css({
  marginLeft: "auto",
  fontSize: "xs",
  color: "neutral.s80",
  fontWeight: "normal",
  flexShrink: 0,
});

const triggerItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[32px]",
  minWidth: "[130px]",
  padding: "2",
  borderRadius: "lg",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.s120",
  cursor: "pointer",
  justifyContent: "space-between",
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

const triggerItemArrowStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
});

// -- Types --------------------------------------------------------------------

export interface MenuItem {
  id: string;
  label: string | ReactNode;
  description?: string;
  icon?: ReactNode;
  /** Content shown on the right side of the item (e.g. keyboard shortcut). */
  suffix?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  destructive?: boolean;
  submenu?: MenuItem[];
}

export interface MenuGroup {
  title?: string;
  items: MenuItem[];
}

export interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[] | MenuGroup[];
  /** Whether to animate the menu open/close. Adapts direction automatically. */
  animated?: boolean;
  /** Preferred placement of the menu relative to the trigger. */
  placement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top-start"
    | "top-end"
    | "bottom-start"
    | "bottom-end"
    | "left-start"
    | "left-end"
    | "right-start"
    | "right-end";
}

// -- Helpers ------------------------------------------------------------------

function isMenuGroupArray(
  items: MenuItem[] | MenuGroup[],
): items is MenuGroup[] {
  return items.length > 0 && items[0] != null && "items" in items[0];
}

function normalizeToGroups(items: MenuItem[] | MenuGroup[]): MenuGroup[] {
  if (items.length === 0) {
    return [];
  }
  if (isMenuGroupArray(items)) {
    return items;
  }
  return [{ items }];
}

// -- Subcomponents ------------------------------------------------------------

const MenuItemContent = ({ item }: { item: MenuItem }) => (
  <>
    {item.icon && <span className={itemIconStyle}>{item.icon}</span>}
    <span className={itemLabelStyle}>
      {typeof item.label === "string" ? (
        <>
          {item.label}
          {item.description && (
            <div className={itemDescriptionStyle}>{item.description}</div>
          )}
        </>
      ) : (
        item.label
      )}
    </span>
    {item.suffix && <span className={itemSuffixStyle}>{item.suffix}</span>}
  </>
);

// -- Component ----------------------------------------------------------------

export const Menu: React.FC<MenuProps> = ({
  trigger,
  items,
  animated,
  placement,
}) => {
  const portalContainerRef = usePortalContainerRef();
  const groups = normalizeToGroups(items);

  return (
    <ArkMenu.Root
      lazyMount={!!animated}
      unmountOnExit={!!animated}
      positioning={placement ? { placement, gutter: 8 } : { gutter: 8 }}
    >
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <Portal container={portalContainerRef}>
        <ArkMenu.Positioner>
          <ArkMenu.Content className={menuContentStyle({ animated })}>
            {groups.map((group, groupIndex) => (
              <div key={group.title ?? `group-${String(groupIndex)}`}>
                {groupIndex > 0 && <div className={separatorStyle} />}
                <div className={groupStyle}>
                  {group.title && (
                    <div className={groupTitleStyle}>{group.title}</div>
                  )}
                  <div className={groupItemsStyle}>
                    {group.items.map((item) =>
                      item.submenu ? (
                        <ArkMenu.Root
                          key={item.id}
                          lazyMount
                          unmountOnExit
                          positioning={{
                            placement: "right-start",
                            gutter: 4,
                          }}
                        >
                          <ArkMenu.TriggerItem className={triggerItemStyle}>
                            <MenuItemContent item={item} />
                            <span className={triggerItemArrowStyle}>›</span>
                          </ArkMenu.TriggerItem>
                          <Portal container={portalContainerRef}>
                            <ArkMenu.Positioner>
                              <ArkMenu.Content className={submenuContentStyle}>
                                <div className={groupStyle}>
                                  <div className={groupItemsStyle}>
                                    {item.submenu.map((subitem) => (
                                      <ArkMenu.Item
                                        key={subitem.id}
                                        id={subitem.id}
                                        disabled={subitem.disabled}
                                        value={subitem.id}
                                        onClick={subitem.onClick}
                                        className={itemStyle({
                                          selected: subitem.selected,
                                          destructive: subitem.destructive,
                                        })}
                                      >
                                        <MenuItemContent item={subitem} />
                                      </ArkMenu.Item>
                                    ))}
                                  </div>
                                </div>
                              </ArkMenu.Content>
                            </ArkMenu.Positioner>
                          </Portal>
                        </ArkMenu.Root>
                      ) : (
                        <ArkMenu.Item
                          key={item.id}
                          id={item.id}
                          disabled={item.disabled}
                          value={item.id}
                          onClick={item.onClick}
                          className={itemStyle({
                            selected: item.selected,
                            destructive: item.destructive,
                          })}
                        >
                          <MenuItemContent item={item} />
                        </ArkMenu.Item>
                      ),
                    )}
                  </div>
                </div>
              </div>
            ))}
          </ArkMenu.Content>
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
};
