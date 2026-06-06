import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";

import {
  SelectableList,
  type ItemOrGroup,
  type Item,
} from "../SelectableList/selectable-list";
import { type Position } from "../Tooltip/tooltip";

export const Menu = ({
  items,
  trigger,
  align = "BottomLeft",
}: {
  items: Array<ItemOrGroup<Item>>;
  align?: Position;
  trigger: React.ReactNode;
  // trigger: (
  // onClick: React.MouseEventHandler,
  // onKeyDown: React.KeyboardEventHandler,
  // pressed: boolean,
  // ) => React.ReactNode;
}) => {
  return (
    <ArkMenu.Root>
      <ArkMenu.Trigger className={styles.Trigger}>{trigger}</ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner>
          <SelectableList items={items} />
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
};
