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
  loading,
}: {
  items: Array<ItemOrGroup<Item>>;
  trigger: React.ReactNode;
  align?: Position;
  loading?: boolean;
}) => {
  return (
    <ArkMenu.Root>
      <ArkMenu.Trigger>{trigger}</ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner>
          <SelectableList items={items} loading={loading} />
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
};
