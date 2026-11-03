import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { useMemo } from "react";

import { parkedPopperPositioner } from "../../util/popper-positioner";
import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  SelectableList,
  type ItemOrGroup,
} from "../../util/SelectableList/selectable-list";
import { useLoopSelection } from "../../util/SelectableList/selectable-list-util";
import { type MenuItem } from "../Menu/menu";
import { collectSelectedIds } from "../Menu/menu-util";
import { type Position } from "../Tooltip/tooltip";

export const RightClickMenu = ({
  items,
  position = "bottom-start",
  className,
  children,
}: {
  items: Array<ItemOrGroup<MenuItem>>;
  /**
   * The preferred position of the menu relative to the pointer it opens at;
   * another may be chosen for a better fit.
   */
  position?: Position;
  /** Applied to the menu content, as with `Menu`. */
  className?: string;
  /**
   * The area to attach the context menu to. Right-clicking (or long-pressing
   * on touch/pen) anywhere within the rendered children opens the menu.
   */
  children: React.ReactNode;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const handleLoopKeyDown = useLoopSelection(items);
  const selected = useMemo(() => collectSelectedIds(items), [items]);

  if (items.length === 0) {
    return children;
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
            <ArkMenu.ContextTrigger asChild>
              <div style={{ display: "contents" }}>{children}</div>
            </ArkMenu.ContextTrigger>
            <Portal container={portalContainerRef}>
              <ArkMenu.Positioner
                className={parkedPopperPositioner}
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

// Stable name for the docs Stage code serializer under minification
RightClickMenu.displayName = "RightClickMenu";
