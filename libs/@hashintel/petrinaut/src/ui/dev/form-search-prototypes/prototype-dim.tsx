/**
 * Prototype B — "Filter in place". A persistent filter box above the form:
 * typing dims every row whose trigger does not fuzzy-match, so matches keep
 * their spatial context — you see WHERE the thing lives, neighbours
 * included — at the cost of a busier reading than a results list.
 *
 * Prototype-grade DOM: the dimming walks the rendered triggers and sets
 * opacity on their enclosing rows directly (the real feature would thread a
 * filter through the form). A form re-render while a filter is active can
 * repaint rows; retyping reapplies.
 */

import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { fuzzyMatch } from "./fuzzy";
import { triggerElements } from "./search-index";

import type { SearchEntry } from "./search-index";

const barStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  position: "sticky",
  top: "1",
  zIndex: "[40]",
});

const inputStyle = css({
  width: "[320px]",
  paddingX: "3",
  paddingY: "1.5",
  fontSize: "sm",
  fontFamily: "mono",
  border: "1px solid",
  borderColor: "neutral.a45",
  borderRadius: "sm",
  backgroundColor: "neutral.s00",
  boxShadow: "sm",
});

const countStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

/** The row-ish container a trigger's dimming applies to. */
function rowOf(element: HTMLElement): HTMLElement {
  return (
    element.closest<HTMLElement>("tr") ??
    element.closest<HTMLElement>("[class]") ??
    element
  );
}

export const DimPrototype = ({
  index,
  rootRef,
}: {
  index: SearchEntry[];
  rootRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const [query, setQuery] = useState("");

  const matchingLabels = new Set(
    query
      ? index
          .filter((entry) => fuzzyMatch(query, entry.text) !== null)
          .map((entry) => entry.ariaLabel)
      : index.map((entry) => entry.ariaLabel),
  );
  const matchCount = query
    ? index.filter((entry) => fuzzyMatch(query, entry.text) !== null).length
    : index.length;

  // Direct DOM styling is the prototype shortcut: the form knows nothing
  // about the filter, so the layer paints over it and restores on change.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const dimmed: HTMLElement[] = [];
    if (query) {
      const { other } = triggerElements(root, matchingLabels);
      for (const element of other) {
        const row = rowOf(element);
        row.style.opacity = "0.2";
        dimmed.push(row);
      }
      // Rows that contain a match win over the dim of their siblings.
      const { matching } = triggerElements(root, matchingLabels);
      for (const element of matching) {
        rowOf(element).style.opacity = "";
      }
    }
    return () => {
      for (const row of dimmed) {
        row.style.opacity = "";
      }
    };
  });

  return (
    <div className={barStyle}>
      <input
        className={inputStyle}
        placeholder="Filter the form (dims non-matches)…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <span className={countStyle}>
        {query ? `${matchCount} of ${index.length} names match` : `${index.length} names`}
      </span>
    </div>
  );
};
