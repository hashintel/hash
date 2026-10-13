import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { cloneElement, useMemo } from "react";

import { parkedPopperPositioner } from "../../util/popper-positioner";
import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../../util/SelectableList/selectable-list";
import {
  getEventHighlightedId,
  useLoopSelection,
} from "../../util/SelectableList/selectable-list-util";
import { type Position } from "../Tooltip/tooltip";
import { collectSelectedIds } from "./menu-util";

export type MenuItem = Item & { selected?: boolean };

export const Menu = ({
  items,
  trigger,
  position = "bottom-start",
  className,
  header,
  footer,
  swapHeaderFooterOnFlip,
  onOpen,
  onKeyDown,
}: {
  items: Array<ItemOrGroup<MenuItem>>;
  trigger: React.ReactElement;
  position?: Position;
  className?: string;
  /**
   * Pinned above the items, outside the scrollable area. Undecorated —
   * supply your own divider if needed.
   */
  header?: React.ReactNode;
  /**
   * Pinned below the items, outside the scrollable area. Undecorated —
   * supply your own divider if needed.
   */
  footer?: React.ReactNode;
  /** Swap the header/footer to the opposite edge when the menu opens upward. */
  swapHeaderFooterOnFlip?: boolean;
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
                className={parkedPopperPositioner}
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
                  header={header}
                  footer={footer}
                  swapHeaderFooterOnFlip={swapHeaderFooterOnFlip}
                />
              </ArkMenu.Positioner>
            </Portal>
          </>
        )}
      </ArkMenu.Context>
    </ArkMenu.Root>
  );
};
