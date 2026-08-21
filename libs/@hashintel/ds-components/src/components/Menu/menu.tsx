import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { cloneElement, useMemo } from "react";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { type Position } from "../Tooltip/tooltip";
import { collectSelectedIds } from "./collect-selected-ids";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "./SelectableList/selectable-list";
import {
  getEventHighlightedId,
  useLoopSelection,
} from "./SelectableList/selectable-list-util";

export type MenuItem = Item & { selected?: boolean };

export const Menu = ({
  items,
  trigger,
  position = "bottom-start",
  className,
  onOpen,
  onKeyDown,
}: {
  items: Array<ItemOrGroup<MenuItem>>;
  trigger: React.ReactElement;
  position?: Position;
  className?: string;
  onOpen?: (open: boolean) => void;
  /** Key events from the open menu */
  onKeyDown?: (
    event: React.KeyboardEvent,
    highlightedValue: string | null,
  ) => void;
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
      onOpenChange={({ open }) => onOpen?.(open)}
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
                onKeyDownCapture={(event) => {
                  handleLoopKeyDown(event, menu);
                  onKeyDown?.(event, getEventHighlightedId(event, menu));
                }}
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
