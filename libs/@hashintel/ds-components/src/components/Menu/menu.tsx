import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { cloneElement, useMemo } from "react";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { type Position } from "../Tooltip/tooltip";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "./SelectableList/selectable-list";
import {
  getItemId,
  isGroup,
  useLoopSelection,
} from "./SelectableList/selectable-list-util";

export type MenuItem = Item & { selected?: boolean };

const collectSelectedIds = (
  entries: Array<ItemOrGroup<MenuItem>>,
): string[] => {
  const result: string[] = [];
  const visit = (entry: ItemOrGroup<MenuItem>) => {
    if (isGroup(entry)) {
      for (const child of entry.items) {
        visit(child);
      }
      return;
    }
    if (entry.selected) {
      result.push(getItemId(entry));
    }
    if (entry.nestedItems) {
      for (const child of entry.nestedItems) {
        visit(child);
      }
    }
  };
  for (const entry of entries) {
    visit(entry);
  }
  return result;
};

export const Menu = ({
  items,
  trigger,
  position = "bottom-start",
  className,
}: {
  items: Array<ItemOrGroup<MenuItem>>;
  trigger: React.ReactElement;
  position?: Position;
  className?: string;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const handleLoopKeyDown = useLoopSelection(items);
  const selected = useMemo(() => collectSelectedIds(items), [items]);

  return (
    <ArkMenu.Root positioning={{ placement: position }} loopFocus={false}>
      <ArkMenu.Context>
        {(menu) => (
          <>
            <ArkMenu.Trigger asChild>
              {cloneElement(
                trigger as React.ReactElement<{
                  pressed?: boolean;
                  "aria-pressed"?: boolean;
                }>,
                { pressed: menu.open, "aria-pressed": false },
              )}
            </ArkMenu.Trigger>
            {items.length > 0 && (
              <Portal container={portalContainerRef}>
                <ArkMenu.Positioner
                  onKeyDownCapture={(event) => handleLoopKeyDown(event, menu)}
                >
                  <SelectableList
                    items={items}
                    className={className}
                    selected={selected}
                    size="sm"
                  />
                </ArkMenu.Positioner>
              </Portal>
            )}
          </>
        )}
      </ArkMenu.Context>
    </ArkMenu.Root>
  );
};
