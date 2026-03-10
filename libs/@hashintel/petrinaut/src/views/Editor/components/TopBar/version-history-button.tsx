import { use, useMemo } from "react";
import { LuCheck, LuHistory } from "react-icons/lu";

import { IconButton } from "../../../../components/icon-button";
import { Menu, type MenuItem } from "../../../../components/menu";
import { UndoRedoContext } from "../../../../state/undo-redo-context";

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
        suffix: isCurrent && <LuCheck size={14} />,
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
        <IconButton size="md" variant="ghost" aria-label="Version history">
          <LuHistory size={16} />
        </IconButton>
      }
      items={menuItems}
      animated
      maxHeight="310px"
      closeOnSelect={false}
      placement="bottom-end"
    />
  );
};
