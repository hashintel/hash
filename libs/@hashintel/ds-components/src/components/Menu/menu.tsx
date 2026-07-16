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

export const collectSelectedIds = (
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
    if (entry.subItems) {
      for (const child of entry.subItems) {
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

  if (items.length === 0) {
    return trigger;
  }

  return (
    <ArkMenu.Root
      positioning={{ placement: position }}
      loopFocus={false}
      lazyMount
      unmountOnExit
    >
      <ArkMenu.Context>
        {(menu) => (
          <>
            <ArkMenu.Trigger asChild>
              {cloneElement(
                trigger as React.ReactElement<{ "aria-expanded"?: boolean }>,
                { "aria-expanded": menu.open },
              )}
            </ArkMenu.Trigger>
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
          </>
        )}
      </ArkMenu.Context>
    </ArkMenu.Root>
  );
};
