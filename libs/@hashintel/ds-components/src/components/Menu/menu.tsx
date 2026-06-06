import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { cloneElement } from "react";

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
  loading,
}: {
  items: Array<ItemOrGroup<Item>>;
  trigger: React.ReactElement;
  position?: Position;
  loading?: boolean;
}) => {
  const { handleOpenChange, handleKeyDownCapture } = useLoopSelection(items);

  return (
    <ArkMenu.Root
      positioning={{ placement: position }}
      onOpenChange={handleOpenChange}
    >
      <ArkMenu.Context>
        {(menu) => (
          <>
            <ArkMenu.Trigger asChild>
              {cloneElement(
                trigger as React.ReactElement<{ pressed?: boolean }>,
                { pressed: menu.open },
              )}
            </ArkMenu.Trigger>
            <Portal>
              <ArkMenu.Positioner
                onKeyDownCapture={(event) => handleKeyDownCapture(event, menu)}
              >
                <SelectableList items={items} loading={loading} />
              </ArkMenu.Positioner>
            </Portal>
          </>
        )}
      </ArkMenu.Context>
    </ArkMenu.Root>
  );
};
