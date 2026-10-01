import { useEffect, useRef, useState } from "react";

import { Icon, Popover, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  PlaceFilledIcon,
  TransitionFilledIcon,
} from "../constants/entity-icons";

export type PickerRow = {
  id: string;
  name: string;
  /** Draws the node's kind icon before the name. */
  nodeKind?: "place" | "transition";
  /** Short text at the row's right, such as "Added". */
  suffix?: string;
  disabled?: boolean;
  /** The row the lever points at now: ticked. */
  current?: boolean;
};

export type PickerGroup = { id: string; label: string; rows: PickerRow[] };

const panelStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "[400px]",
  maxHeight: "[440px]",
});

const searchStyle = css({ padding: "1.5", flexShrink: "0" });

const listStyle = css({
  overflowY: "auto",
  paddingBottom: "1.5",
});

const groupLabelStyle = css({
  paddingX: "2.5",
  paddingTop: "2",
  paddingBottom: "1",
  fontSize: "[11px]",
  fontWeight: "medium",
  letterSpacing: "[0.04em]",
  textTransform: "uppercase",
  color: "neutral.s90",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[calc(100% - 12px)]",
  marginX: "1.5",
  paddingX: "2",
  paddingY: "1.5",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  fontSize: "sm",
  color: "neutral.s120",
  textAlign: "left",
  cursor: "pointer",
  "&[data-highlighted]": { backgroundColor: "neutral.bg.surface.hover" },
  _disabled: { color: "neutral.s80", cursor: "default" },
});

const tickStyle = css({
  display: "flex",
  width: "[14px]",
  flexShrink: "0",
  color: "neutral.s120",
});

const nodeIconStyle = css({
  display: "flex",
  flexShrink: "0",
  color: "[#9ca3af]",
});

const nameStyle = css({
  flex: "1",
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const suffixStyle = css({
  flexShrink: "0",
  fontSize: "[11px]",
  lineHeight: "[16px]",
  color: "neutral.s100",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "1.5",
});

const emptyStyle = css({
  paddingX: "2.5",
  paddingY: "2",
  fontSize: "sm",
  color: "neutral.s100",
});

/**
 * A searchable list of nodes, grouped, that opens beside its anchor over the
 * canvas. Picking a row closes it. Arrow keys move the highlight; Enter picks.
 */
export const LeverPicker: React.FC<{
  anchor: Element;
  placeholder: string;
  groups: PickerGroup[];
  onPick: (groupId: string, rowId: string) => void;
  onClose: () => void;
}> = ({ anchor, placeholder, groups, onPick, onClose }) => {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(() =>
    Math.max(
      0,
      groups
        .flatMap((group) => group.rows.filter((row) => !row.disabled))
        .findIndex((row) => row.current),
    ),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keeps the highlighted row in view by scrolling the list alone, so the
  // editor around the popover never scrolls.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>("[data-highlighted]");
    if (!list || !row) {
      return;
    }
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop) {
      list.scrollTop = top - 28;
    } else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + row.offsetHeight - list.clientHeight + 8;
    }
  }, [highlighted, query]);

  const needle = query.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => row.name.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.rows.length > 0);
  const enabled = shown.flatMap((group) =>
    group.rows
      .filter((row) => !row.disabled)
      .map((row) => ({ groupId: group.id, rowId: row.id })),
  );
  const active = enabled[Math.min(highlighted, enabled.length - 1)];
  const hasTicks = groups.some((group) => group.rows.some((row) => row.current));

  const pick = (groupId: string, rowId: string) => {
    onPick(groupId, rowId);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted(
        (Math.max(0, Math.min(highlighted, enabled.length - 1)) +
          step +
          enabled.length) %
          Math.max(1, enabled.length),
      );
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      pick(active.groupId, active.rowId);
    } else if (event.key === "Escape") {
      // Stop the editor's own Escape, which would also clear the selection.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <Popover
      triggerRef={{ current: anchor }}
      position="left-start"
      gapX={12}
      onClose={onClose}
      initialFocusRef={inputRef}
    >
      <Popover.Container className={panelStyle}>
        <div role="presentation" onKeyDown={onKeyDown}>
          <div className={searchStyle}>
            <TextInput
              size="sm"
              value={query}
              onChange={(value) => {
                setQuery(value);
                setHighlighted(0);
              }}
              placeholder={placeholder}
              prefix={{ iconName: "search", variant: "subtle" }}
              inputRef={inputRef}
              aria-label={placeholder}
            />
          </div>
          <div
            ref={listRef}
            className={listStyle}
            role="listbox"
            aria-label={placeholder}
          >
            {shown.length === 0 ? (
              <div className={emptyStyle}>No matches</div>
            ) : (
              shown.map((group) => (
                <div key={group.id} role="group" aria-label={group.label}>
                  <div className={groupLabelStyle}>{group.label}</div>
                  {group.rows.map((row) => {
                    const isActive =
                      active?.groupId === group.id && active.rowId === row.id;
                    const NodeIcon =
                      row.nodeKind === "place"
                        ? PlaceFilledIcon
                        : TransitionFilledIcon;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        role="option"
                        aria-selected={row.current ?? false}
                        aria-disabled={row.disabled}
                        disabled={row.disabled}
                        data-highlighted={isActive ? "" : undefined}
                        className={rowStyle}
                        onMouseEnter={() => {
                          const index = enabled.findIndex(
                            (entry) =>
                              entry.groupId === group.id &&
                              entry.rowId === row.id,
                          );
                          if (index >= 0) {
                            setHighlighted(index);
                          }
                        }}
                        onClick={() => pick(group.id, row.id)}
                      >
                        {hasTicks ? (
                          <span className={tickStyle}>
                            {row.current ? (
                              <Icon name="check" size="xs" />
                            ) : null}
                          </span>
                        ) : null}
                        {row.nodeKind ? (
                          <span className={nodeIconStyle}>
                            <NodeIcon size={10} />
                          </span>
                        ) : null}
                        <span className={nameStyle}>{row.name}</span>
                        {row.suffix ? (
                          <span className={suffixStyle}>{row.suffix}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </Popover.Container>
    </Popover>
  );
};
