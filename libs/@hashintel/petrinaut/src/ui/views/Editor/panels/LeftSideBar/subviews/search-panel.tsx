import fuzzysort from "fuzzysort";
import { memo, use, useEffect, useId, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { useSDCPNState } from "../../../../../../react/document/sdcpn-context";
import {
  useEditorActions,
  useEditorFields,
  useIsSelected,
} from "../../../../../../react/state/editor-context";
import { focusLands } from "../../../../../worksheet/focus-flow";
import { useFocusMember } from "../../../../../worksheet/use-focus-member";
import { useFocusStops } from "../../../../../worksheet/use-focus-stops";
import {
  entityGroups,
  entityIcons,
  selectionItemOf,
} from "./entities-tree/entity-groups";
import { SearchQueryContext } from "./search-query-context";

import type { FocusStop } from "../../../../../worksheet/use-focus-stops";
import type { EntityItem } from "./entities-tree/entity-groups";
import type { ReactNode } from "react";

// -- Styles -------------------------------------------------------------------

const searchInputStyle = css({
  flex: "1",
  minWidth: "0",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  outline: "none",
  _placeholder: {
    color: "neutral.s80",
  },
});

const matchCountStyle = css({
  px: "3",
  py: "1.5",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
  borderBottomWidth: "thin",
  borderBottomColor: "neutral.a20",
});

const resultListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  py: "1",
  mx: "-1",
});

const resultRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    cursor: "pointer",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",
    transition: "[background-color 100ms ease-out]",
    _focus: {
      outline: "none",
      backgroundColor: "neutral.bg.subtle.hover",
    },
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "neutral.bg.subtle",
        _hover: { backgroundColor: "neutral.bg.subtle.hover" },
      },
      false: {
        backgroundColor: "[transparent]",
        _hover: { backgroundColor: "neutral.bg.surface.hover" },
      },
    },
  },
});

const resultIconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  /* Adds to the row's gap: the name sits further from the icon than the
     category does from the name. */
  marginRight: "0.5",
});

const resultNameStyle = css({
  flex: "1",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const highlightStyle = css({
  color: "blue.s100",
  fontWeight: "semibold",
});

const resultCategoryStyle = css({
  flexShrink: 0,
  fontSize: "xs",
  color: "neutral.s80",
});

const emptyResultsStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "sm",
  color: "neutral.s65",
  px: "3",
  py: "6",
});

const ICON_SIZE = 12;
const DEFAULT_ICON_COLOR = "#9ca3af";

/** What the search calls an entity of each type, at the right of its row. */
const categories: Record<EntityItem["type"], string> = {
  place: "Node",
  transition: "Node",
  type: "Type",
  differentialEquation: "Equation",
  parameter: "Parameter",
  metric: "Metric",
};

interface SearchResult {
  item: EntityItem;
  highlighted: ReactNode;
}

// -- Components ---------------------------------------------------------------

export const SearchIcon: React.FC = () => <Icon name="search" />;

/** Holds the query for the search input and the results, which the panel draws apart. */
export const SearchQueryProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [query, setQuery] = useState("");

  return (
    <SearchQueryContext value={{ query, setQuery }}>
      {children}
    </SearchQueryContext>
  );
};

const SearchResultRowBody: React.FC<{
  elementId: string;
  result: SearchResult;
  tabIndex: 0 | -1;
}> = ({ elementId, result: { item, highlighted }, tabIndex }) => {
  const isSelected = useIsSelected(item.id);
  const TypeIcon = entityIcons[item.type];

  return (
    <div
      id={elementId}
      role="option"
      tabIndex={tabIndex}
      aria-selected={isSelected}
      className={resultRowStyle({ isSelected })}
    >
      <span
        className={resultIconStyle}
        style={{ color: item.iconColor ?? DEFAULT_ICON_COLOR }}
      >
        <TypeIcon size={ICON_SIZE} />
      </span>
      <span className={resultNameStyle}>{highlighted}</span>
      <span className={resultCategoryStyle}>{categories[item.type]}</span>
    </div>
  );
};

/**
 * The row of one result. It reads its own selection, and `memo` keeps it from
 * rendering each time the list does: the list builds its rows in a loop,
 * where the compiler caches no element.
 */
const SearchResultRow = memo(SearchResultRowBody);

/**
 * The result rows, one member of the search panel's vertical focus flow:
 * arrows walk the rows and select as they move, and a move off the top edge
 * flows back into the search input above.
 *
 * The rows take no handler: the list handles their events itself and finds
 * the result by the row's element.
 */
const SearchResultsList: React.FC<{ results: SearchResult[] }> = ({
  results,
}) => {
  const { selectItem } = useEditorActions();
  // Row elements are found by id, which this prefix keeps apart from the ids
  // of any other list.
  const listId = useId();

  const stops: FocusStop[] = results.map(({ item }) => ({
    id: item.id,
    kind: "row",
  }));
  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    columnCount: 1,
    focusTarget: ({ stopId }) =>
      focusLands(document.getElementById(listId + stopId)),
  });

  /** The result whose row an event came from. */
  const itemAt = (target: EventTarget): EntityItem | undefined => {
    const row =
      target instanceof Element ? target.closest("[role=option]") : null;
    return row
      ? results.find(({ item }) => listId + item.id === row.id)?.item
      : undefined;
  };

  return (
    <div
      ref={attach}
      className={resultListStyle}
      role="listbox"
      tabIndex={-1}
      onClick={(event) => {
        const item = itemAt(event.target);
        if (item) {
          selectItem(selectionItemOf(item));
        }
      }}
      onFocus={(event) => {
        const item = itemAt(event.target);
        if (item) {
          onFocusTarget({ stopId: item.id, column: 0 });
          selectItem(selectionItemOf(item));
        }
      }}
      onKeyDown={(event) => {
        const item = itemAt(event.target);
        if (!item) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          selectItem(selectionItemOf(item));
          return;
        }
        onStopsKeyDown({ stopId: item.id, column: 0 })(event);
      }}
    >
      {results.map((result) => (
        <SearchResultRow
          key={result.item.id}
          elementId={listId + result.item.id}
          result={result}
          tabIndex={tabIndexFor({ stopId: result.item.id, column: 0 })}
        />
      ))}
    </div>
  );
};

export const SearchContent: React.FC = () => {
  // The root net's entities, whichever net is open.
  const petriNetDefinition = useSDCPNState(
    (document) => document.petriNetDefinition,
  );
  const extensions = useSDCPNState((document) => document.extensions);
  const { query } = use(SearchQueryContext);
  const allItems = entityGroups(petriNetDefinition, extensions).flatMap(
    (group) => group.children,
  );

  const trimmed = query.trim();
  const results: SearchResult[] =
    trimmed === ""
      ? []
      : fuzzysort
          .go(trimmed, allItems, {
            key: "name",
            threshold: -1000,
          })
          .map((result) => ({
            item: result.obj,
            highlighted: result.highlight((match, i) => (
              <span key={i} className={highlightStyle}>
                {match}
              </span>
            )),
          }));

  const hasQuery = trimmed !== "";
  const matchLabel = hasQuery
    ? `${results.length} match${results.length === 1 ? "" : "es"}`
    : null;

  return (
    <>
      {matchLabel && <div className={matchCountStyle}>{matchLabel}</div>}
      {results.length > 0 ? (
        <SearchResultsList results={results} />
      ) : hasQuery ? (
        <div className={emptyResultsStyle}>No matches</div>
      ) : null}
    </>
  );
};

/**
 * The search input, the first member of the search panel's vertical focus
 * flow: ArrowDown hands focus to the result list below.
 */
export const SearchTitle: React.FC = () => {
  const { isSearchOpen, searchInputRef } = useEditorFields(
    "isSearchOpen",
    "searchInputRef",
  );
  const { query, setQuery } = use(SearchQueryContext);
  const { attach, moveFrom } = useFocusMember(() =>
    focusLands(searchInputRef.current),
  );

  useEffect(() => {
    if (isSearchOpen) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [isSearchOpen, searchInputRef]);

  return (
    <input
      ref={(element) => {
        searchInputRef.current = element;
        attach(element);
      }}
      type="text"
      placeholder="Find anything…"
      className={searchInputStyle}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveFrom("down");
        }
      }}
    />
  );
};

export const SearchHeaderAction: React.FC = () => {
  const { setSearchOpen } = useEditorActions();

  return (
    <Button
      aria-label="Close search"
      tooltip="Close search"
      variant="ghost"
      size="xxs"
      iconName="close"
      onClick={() => setSearchOpen(false)}
    />
  );
};
