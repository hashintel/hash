import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";

import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../SelectableList/selectable-list";
import { type Position } from "../Tooltip/tooltip";

export const Menu = ({
  items,
  trigger,
  position = "bottom-start",
  loading,
}: {
  items: Array<ItemOrGroup<Item>>;
  trigger: React.ReactNode;
  position?: Position;
  loading?: boolean;
}) => {
  return (
    <ArkMenu.Root positioning={{ placement: position }}>
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner>
          <SelectableList items={items} loading={loading} />
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
};
