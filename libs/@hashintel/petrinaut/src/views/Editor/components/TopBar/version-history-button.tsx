import { use, useMemo } from "react";
import { LuCheck, LuHistory } from "react-icons/lu";

import { IconButton } from "../../../../components/icon-button";
import { Menu, type MenuItem } from "../../../../components/menu";
import { UndoRedoContext } from "../../../../state/undo-redo-context";

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSeconds = Math.round((now - then) / 1000);

  if (diffSeconds < 5) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
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
        label: `Version ${realIndex + 1}`,
        suffix: (
          <>
            {formatRelativeTime(entry.timestamp)}
            {isCurrent && <LuCheck size={14} />}
          </>
        ),
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
      placement="bottom-end"
    />
  );
};
