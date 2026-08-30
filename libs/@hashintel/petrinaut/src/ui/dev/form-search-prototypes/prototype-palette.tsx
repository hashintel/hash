/**
 * Prototype A — "Command palette". ⌘K (or the button) opens a floating
 * search over everything the form contains; typing fuzzy-filters, ↑/↓ walk
 * the ranked list, Enter jumps — scroll, focus (which IS selection in the
 * worksheet model), and a flash on the landing trigger. The form itself is
 * untouched: search is a layer, discoverable and keyboard-first, but the
 * results live outside the user's spatial context.
 */

import { useEffect, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { rankMatches } from "./fuzzy";
import { jumpToEntry } from "./search-index";

import type { RankedResult } from "./fuzzy";
import type { SearchEntry } from "./search-index";

const openButtonStyle = css({
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  paddingX: "3",
  paddingY: "1.5",
  borderRadius: "sm",
  border: "1px solid",
  borderColor: "neutral.a45",
  backgroundColor: "neutral.s05",
  fontSize: "sm",
  color: "neutral.s90",
  cursor: "pointer",
});

const overlayStyle = css({
  position: "fixed",
  inset: "0",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: "[12vh]",
  zIndex: "[60]",
});

const backdropButtonStyle = css({
  position: "absolute",
  inset: "0",
  backgroundColor: "[rgb(15 23 42 / 0.28)]",
  border: "none",
  cursor: "default",
});

const panelStyle = css({
  position: "relative",
  width: "[480px]",
  maxWidth: "[90vw]",
  backgroundColor: "neutral.s00",
  borderRadius: "md",
  border: "1px solid",
  borderColor: "neutral.a45",
  boxShadow: "lg",
  overflow: "hidden",
});

const inputStyle = css({
  width: "full",
  padding: "3",
  fontSize: "base",
  fontFamily: "mono",
  border: "none",
  outline: "none",
  borderBottom: "1px solid",
  borderColor: "neutral.a45",
});

const listStyle = css({
  maxHeight: "[320px]",
  overflowY: "auto",
});

const resultStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  width: "full",
  paddingX: "3",
  paddingY: "1.5",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "sm",
});

const activeResultStyle = css({
  backgroundColor: "blue.s20",
});

const kindChipStyle = css({
  fontSize: "[10px]",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.s80",
  minWidth: "[92px]",
});

const nameStyle = css({
  fontFamily: "mono",
  color: "neutral.s110",
});

const matchedCharStyle = css({
  color: "blue.s100",
  fontWeight: "semibold",
});

const detailStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const emptyStyle = css({
  padding: "3",
  fontSize: "sm",
  color: "neutral.s80",
});

/** The entry's text with the matched characters emphasised. */
const HighlightedText = ({
  text,
  positions,
}: {
  text: string;
  positions: readonly number[];
}) => {
  const matched = new Set(positions);
  return (
    <span className={nameStyle}>
      {Array.from(text).map((char, index) => (
        <span
          // eslint-disable-next-line react/no-array-index-key -- characters are positional
          key={index}
          className={matched.has(index) ? matchedCharStyle : undefined}
        >
          {char}
        </span>
      ))}
    </span>
  );
};

export const PalettePrototype = ({
  index,
  rootRef,
}: {
  index: SearchEntry[];
  rootRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen(true);
        setQuery("");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results: RankedResult<SearchEntry>[] = open
    ? rankMatches(query, index, (entry) => entry.text, 12)
    : [];
  const clampedCursor = Math.min(cursor, Math.max(0, results.length - 1));

  const jump = (entry: SearchEntry) => {
    setOpen(false);
    if (rootRef.current) {
      jumpToEntry(rootRef.current, entry);
    }
  };

  return (
    <>
      <button
        type="button"
        className={openButtonStyle}
        onClick={() => {
          setOpen(true);
          setQuery("");
          setCursor(0);
        }}
      >
        Search the form… <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className={overlayStyle}>
          <button
            type="button"
            aria-label="Close search"
            className={backdropButtonStyle}
            onClick={() => setOpen(false)}
          />
          <div className={panelStyle}>
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- palette semantics
              autoFocus
              ref={inputRef}
              className={inputStyle}
              placeholder="Fuzzy-search parameters, variables, places…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor(Math.min(clampedCursor + 1, results.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor(Math.max(clampedCursor - 1, 0));
                }
                if (event.key === "Enter" && results[clampedCursor]) {
                  jump(results[clampedCursor].entry);
                }
              }}
            />
            <div className={listStyle}>
              {results.length === 0 ? (
                <div className={emptyStyle}>
                  {query ? "No matches." : "Type to search."}
                </div>
              ) : (
                results.map((result, at) => (
                  <button
                    key={`${result.entry.kind}:${result.entry.text}`}
                    type="button"
                    className={cx(
                      resultStyle,
                      at === clampedCursor && activeResultStyle,
                    )}
                    onMouseEnter={() => setCursor(at)}
                    onClick={() => jump(result.entry)}
                  >
                    <span className={kindChipStyle}>{result.entry.kind}</span>
                    <HighlightedText
                      text={result.entry.text}
                      positions={result.match.positions}
                    />
                    <span className={detailStyle}>{result.entry.detail}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
