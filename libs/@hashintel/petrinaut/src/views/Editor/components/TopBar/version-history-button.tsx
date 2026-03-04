import { css, cx } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbClock } from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import { Popover } from "../../../../components/popover";
import { UndoRedoContext } from "../../../../state/undo-redo-context";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  maxHeight: "[300px]",
  overflowY: "auto",
});

const entryStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[6px_8px]",
  fontSize: "[12px]",
  color: "neutral.s100",
  cursor: "pointer",
  borderRadius: "[4px]",
  border: "none",
  backgroundColor: "[transparent]",
  width: "[100%]",
  textAlign: "left",
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

const activeEntryStyle = css({
  backgroundColor: "neutral.s10",
  fontWeight: "semibold",
});

const entryNumberStyle = css({
  color: "neutral.s60",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
});

const entryTimeStyle = css({
  color: "neutral.s60",
  marginLeft: "auto",
  flexShrink: 0,
});

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

  if (!undoRedo) {
    return null;
  }

  const { history, currentIndex, goToIndex } = undoRedo;

  return (
    <Popover.Root positioning={{ placement: "bottom-end" }}>
      <Popover.Trigger asChild>
        <IconButton size="md" variant="outline" aria-label="Version history">
          <TbClock size={16} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content>
        <Popover.Header>Version History</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <div className={listStyle}>
              {[...history].reverse().map((entry, reversedIdx) => {
                const realIndex = history.length - 1 - reversedIdx;
                const isCurrent = realIndex === currentIndex;
                return (
                  <button
                    type="button"
                    // eslint-disable-next-line react/no-array-index-key
                    key={reversedIdx}
                    className={cx(entryStyle, isCurrent && activeEntryStyle)}
                    onClick={() => goToIndex(realIndex)}
                  >
                    <span className={entryNumberStyle}>#{realIndex + 1}</span>
                    <span>
                      {isCurrent ? "Current" : `Version ${realIndex + 1}`}
                    </span>
                    <span className={entryTimeStyle}>
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  );
};
