import { useEffect, useRef, useState } from "react";

import {
  Button,
  Icon,
  Popover,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { subjectRowText } from "../../react/controller-prototype/constraints";

import type { SubjectGroup } from "../../react/controller-prototype/constraints";

const triggerStyle = css({
  "&&": {
    fontWeight: "normal",
    whiteSpace: "nowrap",
    borderColor: "neutral.s40",
    _hover: { borderColor: "neutral.s80" },
  },
});

const triggerFillStyle = css({
  "&&": { width: "[100%]", justifyContent: "flex-start" },
  "& > :last-child": { marginLeft: "auto" },
});

const chevronStyle = css({
  display: "block",
  alignSelf: "center",
  width: "[0.5em]",
  height: "[0.5em]",
  borderRight: "[1.5px solid currentColor]",
  borderBottom: "[1.5px solid currentColor]",
  color: "neutral.s100",
  transform: "[rotate(45deg) translateY(-15%)]",
  flex: "[0 0 auto]",
});

const panelStyle = css({
  maxHeight: "[360px]",
  display: "flex",
  flexDirection: "column",
  width: "[320px]",
});

// Tabs keep one height, so switching kind never moves the popover.
const tabbedPanelStyle = css({ height: "[360px]" });

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
  flex: "1",
});

const tabsStyle = css({
  padding: "1.5",
  flexShrink: "0",
  "& > *": { width: "[100%]" },
});

const listStyle = css({
  overflowY: "auto",
  paddingBottom: "1.5",
  outline: "none",
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
});

const tickStyle = css({
  display: "flex",
  width: "[14px]",
  flexShrink: "0",
  color: "neutral.s120",
});

const dotStyle = css({
  display: "inline-block",
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  backgroundColor: "neutral.s90",
  flexShrink: "0",
});

const nameStyle = css({
  flex: "1",
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const triggerDotStyle = css({ marginRight: "1.5" });

const groupOf = (groups: SubjectGroup[], value: string) =>
  groups.find((group) => group.items.some((item) => item.value === value));

/**
 * A subject picker for a check. Several kinds show as tabs above one list at a
 * time; a single kind shows the list alone. Arrow keys move, Enter picks, Escape
 * closes, and typing jumps to the next row that starts with those letters.
 */
export const SubjectPicker: React.FC<{
  groups: SubjectGroup[];
  value: string;
  /** The closed trigger's text, kept whole ("Backorders · tokens"). */
  text: string | undefined;
  placeholder: string;
  /** Marks place and field rows with a grey dot. */
  dotted: boolean;
  disabled: boolean;
  fill?: boolean;
  onChange: (value: string) => void;
}> = ({
  groups,
  value,
  text,
  placeholder,
  dotted,
  disabled,
  fill,
  onChange,
}) => {
  const [button, setButton] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const tabbed = groups.length > 1;
  const shownGroup = groups.find((group) => group.id === tab) ?? groups[0];
  const rows = shownGroup?.items ?? [];

  const indexIn = (group: SubjectGroup | undefined) =>
    Math.max(
      0,
      (group?.items ?? []).findIndex((item) => item.value === value),
    );

  const show = () => {
    const current = groupOf(groups, value) ?? groups[0];
    setTab(current?.id ?? "");
    setHighlighted(indexIn(current));
    setOpen(true);
  };

  // Keeps the highlighted row in view by scrolling the list alone.
  useEffect(() => {
    focusRef.current = list;
    list
      ?.querySelectorAll("[role=option]")
      [highlighted]?.scrollIntoView({ block: "nearest" });
  }, [list, tab, highlighted]);

  const close = () => setOpen(false);

  const pick = (next: string) => {
    onChange(next);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((highlighted + step + rows.length) % Math.max(1, rows.length));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setHighlighted(event.key === "Home" ? 0 : rows.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[highlighted];
      if (row) {
        pick(row.value);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const buffer =
        (now - typed.current.at < 700 ? typed.current.text : "") +
        event.key.toLowerCase();
      typed.current = { text: buffer, at: now };
      const texts = rows.map((item) =>
        subjectRowText(shownGroup?.id ?? "", item.text).toLowerCase(),
      );
      const from = buffer.length === 1 ? highlighted + 1 : highlighted;
      const index = [...texts.slice(from), ...texts.slice(0, from)].findIndex(
        (candidate) => candidate.startsWith(buffer),
      );
      if (index >= 0) {
        setHighlighted((index + from) % texts.length);
      }
    }
  };

  return (
    <>
      <span ref={setButton} style={{ display: fill ? "block" : "inline-flex" }}>
        <Button
          size="sm"
          variant="subtle"
          className={cx(triggerStyle, fill && triggerFillStyle)}
          suffix={<span className={chevronStyle} />}
          aria-label="Subject"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={show}
        >
          {text ? (
            <>
              {dotted ? (
                <span className={cx(dotStyle, triggerDotStyle)} />
              ) : null}
              {text}
            </>
          ) : (
            placeholder
          )}
        </Button>
      </span>
      {open && button ? (
        <Popover
          triggerRef={{ current: button }}
          position="bottom-start"
          gapY={4}
          onClose={close}
          initialFocusRef={focusRef}
        >
          <Popover.Container
            className={cx(panelStyle, tabbed && tabbedPanelStyle)}
          >
            <div
              role="presentation"
              className={bodyStyle}
              onKeyDown={onKeyDown}
            >
              {tabbed ? (
                <div className={tabsStyle}>
                  <SegmentedControl
                    size="xs"
                    aria-label="Subject kind"
                    value={shownGroup?.id ?? ""}
                    items={groups.map((group) => ({
                      value: group.id,
                      label: group.label,
                    }))}
                    onChange={(next) => {
                      setTab(next);
                      setHighlighted(
                        indexIn(groups.find((group) => group.id === next)),
                      );
                      list?.focus();
                    }}
                  />
                </div>
              ) : null}
              <div
                ref={setList}
                className={listStyle}
                role="listbox"
                tabIndex={-1}
                aria-label="Subject"
              >
                {rows.map((item, index) => (
                  <button
                    key={item.value}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={item.value === value}
                    data-highlighted={index === highlighted ? "" : undefined}
                    className={rowStyle}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => pick(item.value)}
                  >
                    <span className={tickStyle}>
                      {item.value === value ? (
                        <Icon name="check" size="xs" />
                      ) : null}
                    </span>
                    {dotted && shownGroup?.id !== "metrics" ? (
                      <span className={dotStyle} />
                    ) : null}
                    <span className={nameStyle}>
                      {subjectRowText(shownGroup?.id ?? "", item.text)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Popover.Container>
        </Popover>
      ) : null}
    </>
  );
};
