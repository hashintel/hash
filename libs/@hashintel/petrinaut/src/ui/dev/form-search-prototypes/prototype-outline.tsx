/**
 * Prototype D — "Outline rail". A permanent index beside the form: every
 * parameter, Variable, and place, grouped, with a filter box on top. A
 * click jumps; the rail doubles as a map of the model even before anything
 * is typed. Costs horizontal space, and it duplicates names the form
 * already shows — the trade against the palette's transience.
 */

import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { fuzzyMatch } from "./fuzzy";
import { jumpToEntry, kindRank } from "./search-index";

import type { SearchEntry, SearchEntryKind } from "./search-index";

const layoutStyle = css({
  display: "flex",
  gap: "4",
  alignItems: "flex-start",
});

const railStyle = css({
  position: "sticky",
  top: "2",
  width: "[240px]",
  flexShrink: "0",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  maxHeight: "[85vh]",
  overflowY: "auto",
  padding: "2",
  border: "1px solid",
  borderColor: "neutral.a45",
  borderRadius: "sm",
  backgroundColor: "neutral.s05",
});

const filterStyle = css({
  paddingX: "2",
  paddingY: "1",
  fontSize: "sm",
  fontFamily: "mono",
  border: "1px solid",
  borderColor: "neutral.a45",
  borderRadius: "sm",
  backgroundColor: "neutral.s00",
});

const groupTitleStyle = css({
  fontSize: "[10px]",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.s80",
  marginTop: "1",
});

const itemStyle = css({
  display: "block",
  width: "full",
  textAlign: "left",
  paddingX: "2",
  paddingY: "0.5",
  fontSize: "xs",
  fontFamily: "mono",
  color: "neutral.s100",
  borderRadius: "sm",
  cursor: "pointer",
  _hover: { backgroundColor: "blue.s20" },
});

const emptyStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  paddingX: "2",
});

const GROUP_LABELS: Record<SearchEntryKind, string> = {
  parameter: "Parameters",
  variable: "Variables",
  "place variable": "Place variables",
  place: "Places",
};

/**
 * The rail itself; the hosting story lays it out beside the form by
 * passing the form as `children`.
 */
export const OutlineRail = ({
  index,
  rootRef,
  children,
}: {
  index: SearchEntry[];
  rootRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) => {
  const [query, setQuery] = useState("");

  const visible = index.filter(
    (entry) => fuzzyMatch(query, entry.text) !== null,
  );
  const groups = [...new Set(visible.map((entry) => entry.kind))].sort(
    (a, b) => kindRank(a) - kindRank(b),
  );

  return (
    <div className={layoutStyle}>
      <nav className={railStyle} aria-label="Form outline">
        <input
          className={filterStyle}
          placeholder="Filter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {visible.length === 0 ? (
          <span className={emptyStyle}>No matches.</span>
        ) : (
          groups.map((kind) => (
            <div key={kind}>
              <div className={groupTitleStyle}>{GROUP_LABELS[kind]}</div>
              {visible
                .filter((entry) => entry.kind === kind)
                .map((entry) => (
                  <button
                    key={entry.text}
                    type="button"
                    className={itemStyle}
                    title={entry.detail}
                    onClick={() => {
                      if (rootRef.current) {
                        jumpToEntry(rootRef.current, entry);
                      }
                    }}
                  >
                    {entry.text}
                  </button>
                ))}
            </div>
          ))
        )}
      </nav>
      {children}
    </div>
  );
};
