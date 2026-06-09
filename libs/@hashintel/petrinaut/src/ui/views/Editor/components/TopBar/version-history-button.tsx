import { use } from "react";

import { Button, Icon, Menu, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { UndoRedoContext } from "../../../../../react/state/undo-redo-context";

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const menuMaxHeightStyle = css({ maxHeight: "[310px]", minWidth: "[170px]" });

export const VersionHistoryButton = () => {
  const undoRedo = use(UndoRedoContext);

  if (!undoRedo) {
    return null;
  }

  const { history, currentIndex, goToIndex } = undoRedo;

  const menuItems: MenuItem[] = [...history]
    .reverse()
    .map((entry, reversedIdx) => {
      const realIndex = history.length - 1 - reversedIdx;
      const isCurrent = realIndex === currentIndex;
      return {
        id: `version-${String(realIndex)}`,
        text: formatTime(entry.timestamp),
        suffix: isCurrent && <Icon name="check" size="xs" />,
        selected: isCurrent,
        tone: isCurrent ? "brand" : "neutral",
        keepOpenOnSelect: true,
        onClick: () => goToIndex(realIndex),
      };
    });

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
      className={menuMaxHeightStyle}
      position="bottom-end"
    />
  );
};
