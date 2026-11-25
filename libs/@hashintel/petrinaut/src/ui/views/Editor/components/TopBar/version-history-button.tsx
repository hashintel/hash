import { use, useState } from "react";

import { Button, Icon, Menu, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  UndoRedoContext,
  type UndoHistory,
} from "../../../../../react/document/undo-redo-context";
import { constantStore, useStore } from "../../../../../react/shared/use-store";

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const menuMaxHeightStyle = css({ maxHeight: "[310px]", minWidth: "[170px]" });

const noHistory = constantStore<UndoHistory>({ entries: [], currentIndex: 0 });

// The menu draws no popup for an empty list, so a closed menu keeps one row.
// It is replaced by the entries as the menu opens and is never shown.
const closedMenuItems: MenuItem[] = [
  { id: "closed", text: "Recent changes", onClick: () => {} },
];

export const VersionHistoryButton = () => {
  const undoRedo = use(UndoRedoContext);
  // Every edit adds an entry. The list is read only while the menu shows it,
  // so a closed menu renders nothing as the user types.
  const [isOpen, setIsOpen] = useState(false);
  const { entries, currentIndex } = useStore(
    isOpen && undoRedo ? undoRedo.history : noHistory,
  );

  if (!undoRedo) {
    return null;
  }

  const { goToIndex } = undoRedo;

  const menuItems: MenuItem[] = [...entries]
    .reverse()
    .map((entry, reversedIdx) => {
      const realIndex = entries.length - 1 - reversedIdx;
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
      items={isOpen ? menuItems : closedMenuItems}
      onOpen={setIsOpen}
      className={menuMaxHeightStyle}
      position="bottom-end"
    />
  );
};
