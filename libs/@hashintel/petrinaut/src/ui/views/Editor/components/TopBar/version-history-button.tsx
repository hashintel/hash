import { use, useMemo } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import { UndoRedoContext } from "../../../../../react/state/undo-redo-context";
import { Menu, type MenuItem } from "../../../../components/menu";

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const VersionHistoryButton = () => {
  const undoRedo = use(UndoRedoContext);

  const menuItems: MenuItem[] = useMemo(() => {
    if (!undoRedo) {
      return [];
    }
    const { history, currentIndex, goToIndex } = undoRedo;

    return [...history].reverse().map((entry, reversedIdx) => {
      const realIndex = history.length - 1 - reversedIdx;
      const isCurrent = realIndex === currentIndex;
      return {
        id: `version-${String(realIndex)}`,
        label: formatTime(entry.timestamp),
        suffix: isCurrent && <Icon name="check" size="sm" />,
        selected: isCurrent,
        onClick: () => goToIndex(realIndex),
      };
    });
  }, [undoRedo]);

  if (!undoRedo) {
    return null;
  }

  return (
    <Menu
      trigger={
        <Button
          size="md"
          variant="ghost"
          aria-label="Recent changes"
          tooltip="Recent changes"
          iconName="clockRotateLeft"
        />
      }
      items={menuItems}
      animated
      maxHeight="310px"
      closeOnSelect={false}
      placement="bottom-end"
    />
  );
};
