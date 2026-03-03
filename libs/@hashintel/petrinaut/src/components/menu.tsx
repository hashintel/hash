import { Menu as ArkMenu } from "@ark-ui/react";
import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

const menuContentStyle = css({
  background: "[white]",
  borderRadius: "[6px]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
  border: "1px solid",
  borderColor: "neutral.s20",
  minWidth: "[180px]",
  zIndex: "[1001]",
  padding: "[7px]",
});

const submenuContentStyle = css({
  background: "[white]",
  borderRadius: "[6px]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
  border: "1px solid",
  borderColor: "neutral.s20",
  minWidth: "[180px]",
  zIndex: "[1002]",
  padding: "[7px]",
});

const triggerItemStyle = css({
  fontSize: "sm",
  cursor: "pointer",
  borderRadius: "[1px]",
  color: "neutral.s120",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingBlock: "[4px]",
  paddingInline: "[7px]",
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

const triggerItemArrowStyle = css({
  marginLeft: "[8px]",
});

const itemStyle = css({
  fontSize: "sm",
  cursor: "pointer",
  borderRadius: "[3px]",
  color: "neutral.s120",
  paddingBlock: "[4px]",
  paddingInline: "[7px]",
  _hover: {
    backgroundColor: "neutral.s10",
  },
  _disabled: {
    cursor: "not-allowed",
  },
});

export interface MenuItem {
  id: string;
  label: string | ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  submenu?: MenuItem[];
}

export interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
}

export const Menu: React.FC<MenuProps> = ({ trigger, items }) => {
  return (
    <ArkMenu.Root>
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <ArkMenu.Positioner>
        <ArkMenu.Content className={menuContentStyle}>
          {items.map((item) =>
            item.submenu ? (
              <ArkMenu.Root
                key={item.id}
                positioning={{ placement: "right-start", gutter: 4 }}
              >
                <ArkMenu.TriggerItem className={triggerItemStyle}>
                  {item.label}
                  <span className={triggerItemArrowStyle}>›</span>
                </ArkMenu.TriggerItem>
                <ArkMenu.Positioner>
                  <ArkMenu.Content className={submenuContentStyle}>
                    {item.submenu.map((subitem) => (
                      <ArkMenu.Item
                        key={subitem.id}
                        id={subitem.id}
                        disabled={subitem.disabled}
                        value={subitem.id}
                        onClick={subitem.onClick}
                        className={itemStyle}
                      >
                        {subitem.label}
                      </ArkMenu.Item>
                    ))}
                  </ArkMenu.Content>
                </ArkMenu.Positioner>
              </ArkMenu.Root>
            ) : (
              <ArkMenu.Item
                key={item.id}
                id={item.id}
                disabled={item.disabled}
                value={item.id}
                onClick={item.onClick}
                className={itemStyle}
              >
                {item.label}
              </ArkMenu.Item>
            ),
          )}
        </ArkMenu.Content>
      </ArkMenu.Positioner>
    </ArkMenu.Root>
  );
};
