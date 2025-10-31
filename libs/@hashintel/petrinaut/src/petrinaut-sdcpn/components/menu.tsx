import { Menu as ArkMenu } from "@ark-ui/react";
import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface MenuItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
}

export const Menu = ({ trigger, items }: MenuProps) => {
  return (
    <ArkMenu.Root>
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <ArkMenu.Positioner>
        <ArkMenu.Content
          className={css({
            background: "[white]",
            borderRadius: "radius.8",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
            border: "1px solid",
            borderColor: "core.gray.20",
            padding: "spacing.2",
            minWidth: "[180px]",
            zIndex: "[1001]",
          })}
        >
          {items.map((item) => (
            <ArkMenu.Item
              key={item.id}
              id={item.id}
              disabled={item.disabled}
              onClick={item.onClick}
              className={css({
                padding: "spacing.2",
                paddingX: "spacing.3",
                fontSize: "size.textsm",
                cursor: "pointer",
                borderRadius: "radius.4",
                color: "core.gray.90",
                _hover: {
                  backgroundColor: "core.gray.10",
                },
                _disabled: {
                  opacity: "[0.5]",
                  cursor: "not-allowed",
                },
              })}
            >
              {item.label}
            </ArkMenu.Item>
          ))}
        </ArkMenu.Content>
      </ArkMenu.Positioner>
    </ArkMenu.Root>
  );
};
