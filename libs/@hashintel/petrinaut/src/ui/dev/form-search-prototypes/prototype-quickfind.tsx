/**
 * Prototype C — "Quickfind". Browser-find for the worksheet: `/` opens a
 * one-line find (unless typing in an editor), Enter steps to the next
 * match, Shift+Enter to the previous, Escape closes. Focus itself walks the
 * matches — the find bar is chrome, the selection does the showing. Minimal
 * UI, but matches are visited one at a time rather than surveyed.
 */

import { useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { fuzzyMatch } from "./fuzzy";
import { jumpToEntry } from "./search-index";

import type { SearchEntry } from "./search-index";

const barStyle = css({
  position: "fixed",
  top: "3",
  right: "3",
  zIndex: "[60]",
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "2",
  borderRadius: "sm",
  border: "1px solid",
  borderColor: "neutral.a45",
  backgroundColor: "neutral.s00",
  boxShadow: "md",
});

const inputStyle = css({
  width: "[220px]",
  paddingX: "2",
  paddingY: "1",
  fontSize: "sm",
  fontFamily: "mono",
  border: "1px solid",
  borderColor: "neutral.a45",
  borderRadius: "sm",
});

const counterStyle = css({
  fontSize: "xs",
  fontFamily: "mono",
  color: "neutral.s90",
  minWidth: "[48px]",
  textAlign: "center",
});

const hintStyle = css({
  alignSelf: "flex-start",
  fontSize: "xs",
  color: "neutral.s80",
});

function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    target.closest(".monaco-editor") !== null
  );
}

export const QuickfindPrototype = ({
  index,
  rootRef,
}: {
  index: SearchEntry[];
  rootRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTypingContext(event.target)) {
        event.preventDefault();
        setOpen(true);
        setQuery("");
        setPosition(0);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const matches = query
    ? index.filter((entry) => fuzzyMatch(query, entry.text) !== null)
    : [];
  const current = Math.min(position, Math.max(0, matches.length - 1));

  const step = (direction: 1 | -1) => {
    if (matches.length === 0 || !rootRef.current) {
      return;
    }
    const next = (current + direction + matches.length) % matches.length;
    setPosition(next);
    jumpToEntry(rootRef.current, matches[next]!);
  };

  return (
    <>
      <span className={hintStyle}>
        Press <kbd>/</kbd> anywhere outside an editor to find; Enter cycles
        matches.
      </span>
      {open ? (
        <div className={barStyle}>
          <input
            ref={inputRef}
            className={inputStyle}
            placeholder="Find…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPosition(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <span className={counterStyle}>
            {matches.length === 0 ? "0 / 0" : `${current + 1} / ${matches.length}`}
          </span>
          <button type="button" onClick={() => step(-1)} aria-label="Previous match">
            ↑
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next match">
            ↓
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close find">
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
};
