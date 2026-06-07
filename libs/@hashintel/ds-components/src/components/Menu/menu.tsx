import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { cloneElement } from "react";

import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../SelectableList/selectable-list";
import { useLoopSelection } from "../SelectableList/selectable-list-util";
import { type Position } from "../Tooltip/tooltip";

export const Menu = ({
  items,
  trigger,
  position = "bottom-start",
}: {
  items: Array<ItemOrGroup<Item>>;
  trigger: React.ReactElement;
  position?: Position;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const handleLoopKeyDown = useLoopSelection(items);

  return (
    <ArkMenu.Root positioning={{ placement: position }} loopFocus={false}>
      <ArkMenu.Context>
        {(menu) => (
          <>
            <ArkMenu.Trigger asChild>
              {cloneElement(
                trigger as React.ReactElement<{ pressed?: boolean }>,
                { pressed: menu.open },
              )}
            </ArkMenu.Trigger>
            {items.length > 0 && (
              <Portal container={portalContainerRef}>
                <ArkMenu.Positioner
                  onKeyDownCapture={(event) => handleLoopKeyDown(event, menu)}
                >
                  <SelectableList items={items} />
                </ArkMenu.Positioner>
              </Portal>
            )}
          </>
        )}
      </ArkMenu.Context>
    </ArkMenu.Root>
  );
};
