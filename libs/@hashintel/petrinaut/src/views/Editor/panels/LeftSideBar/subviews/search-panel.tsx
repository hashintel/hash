import { css, cva } from "@hashintel/ds-helpers/css";
import fuzzysort from "fuzzysort";
import type { ComponentType, ReactNode } from "react";
import { use, useEffect, useRef, useState } from "react";
import { LuSearch } from "react-icons/lu";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../constants/entity-icons";
import { EditorContext } from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import type { SelectionItem } from "../../../../../state/selection";

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
  outline: "none",
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
    isFocused: {
      true: {
        backgroundColor: "neutral.bg.subtle.hover",
      },
    },
  },
});

const resultContentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "1",
  minWidth: "0",
});

const resultIconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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

// -- Search item types --------------------------------------------------------

interface SearchableItem {
  id: string;
  name: string;
  category: string;
  icon: ComponentType<{ size: number }>;
  iconColor?: string;
  selectionItem: SelectionItem;
}

interface SearchResult {
  item: SearchableItem;
  highlighted: ReactNode;
}

function useSearchableItems(): SearchableItem[] {
  const {
    petriNetDefinition: {
      places,
      transitions,
      types,
      differentialEquations,
      parameters,
    },
  } = use(SDCPNContext);

  return [
    ...places.map((p) => ({
      id: p.id,
      name: p.name || `Place ${p.id}`,
      category: "Node",
      icon: PlaceFilledIcon,
      selectionItem: { type: "place" as const, id: p.id },
    })),
    ...transitions.map((t) => ({
      id: t.id,
      name: t.name || `Transition ${t.id}`,
      category: "Node",
      icon: TransitionFilledIcon,
      selectionItem: { type: "transition" as const, id: t.id },
    })),
    ...types.map((t) => ({
      id: t.id,
      name: t.name,
      category: "Type",
      icon: TokenTypeIcon,
      iconColor: t.displayColor,
      selectionItem: { type: "type" as const, id: t.id },
    })),
    ...differentialEquations.map((eq) => ({
      id: eq.id,
      name: eq.name,
      category: "Equation",
      icon: DifferentialEquationIcon,
      selectionItem: {
        type: "differentialEquation" as const,
        id: eq.id,
      },
    })),
    ...parameters.map((p) => ({
      id: p.id,
      name: p.name,
      category: "Parameter",
      icon: ParameterIcon,
      selectionItem: { type: "parameter" as const, id: p.id },
    })),
  ];
}

// -- Components ---------------------------------------------------------------

const SearchContent: React.FC = () => {
  const {
    isSelected: checkIsSelected,
    selectItem,
    searchInputRef,
  } = use(EditorContext);
  const allItems = useSearchableItems();
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sync query from the input (the input lives in SearchTitle, so we read its value)
  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }

    const handleInput = () => {
      setQuery(input.value);
      // Reset focus when query changes
      setFocusedIndex(null);
    };
    input.addEventListener("input", handleInput);
    setQuery(input.value);
    return () => input.removeEventListener("input", handleInput);
  }, [searchInputRef]);

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

  // Clamp focusedIndex when results shrink
  useEffect(() => {
    if (results.length === 0) {
      setFocusedIndex(null);
    } else {
      setFocusedIndex((prev) =>
        prev !== null ? Math.min(prev, results.length - 1) : prev,
      );
    }
  }, [results.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex !== null) {
      rowRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (results.length === 0) {
          return;
        }
        const nextIndex =
          focusedIndex === null
            ? 0
            : Math.min(focusedIndex + 1, results.length - 1);
        setFocusedIndex(nextIndex);
        const item = results[nextIndex];
        if (item) {
          selectItem(item.item.selectionItem);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (focusedIndex === null || focusedIndex === 0) {
          // Move focus back to the search input
          setFocusedIndex(null);
          searchInputRef.current?.focus();
        } else {
          const nextIndex = focusedIndex - 1;
          setFocusedIndex(nextIndex);
          const item = results[nextIndex];
          if (item) {
            selectItem(item.item.selectionItem);
          }
        }
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (focusedIndex !== null) {
          const item = results[focusedIndex];
          if (item) {
            selectItem(item.item.selectionItem);
          }
        }
        break;
      }
    }
  };

  const hasQuery = trimmed !== "";
  const matchLabel = hasQuery
    ? `${results.length} match${results.length === 1 ? "" : "es"}`
    : null;

  return (
    <>
      {matchLabel && <div className={matchCountStyle}>{matchLabel}</div>}
      {results.length > 0 ? (
        <div
          ref={listRef}
          className={resultListStyle}
          role="listbox"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          onFocus={() => {
            // When the list receives focus (e.g. from ArrowDown in input),
            // highlight the first item. Selection happens on Enter or ArrowDown.
            if (focusedIndex === null && results.length > 0) {
              setFocusedIndex(0);
            }
          }}
        >
          {results.map(({ item, highlighted }, index) => {
            const isSelected = checkIsSelected(item.id);
            const isFocused = focusedIndex === index;
            return (
              <div
                key={item.id}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={resultRowStyle({ isSelected, isFocused })}
                onClick={() => {
                  selectItem(item.selectionItem);
                  setFocusedIndex(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectItem(item.selectionItem);
                    setFocusedIndex(index);
                  }
                }}
              >
                <div className={resultContentStyle}>
                  <span
                    className={resultIconStyle}
                    style={{
                      color: item.iconColor ?? DEFAULT_ICON_COLOR,
                    }}
                  >
                    <item.icon size={ICON_SIZE} />
                  </span>
                  <span className={resultNameStyle}>{highlighted}</span>
                </div>
                <span className={resultCategoryStyle}>{item.category}</span>
              </div>
            );
          })}
        </div>
      ) : hasQuery ? (
        <div className={emptyResultsStyle}>No matches</div>
      ) : null}
    </>
  );
};

const SearchTitle: React.FC = () => {
  const { isSearchOpen, searchInputRef } = use(EditorContext);

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
      ref={searchInputRef}
      type="text"
      placeholder="Find…"
      className={searchInputStyle}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          // Find the result list within the same sub-view section and focus it
          const section = searchInputRef.current?.closest("[data-panel]");
          const list = section?.querySelector<HTMLElement>("[role=listbox]");
          list?.focus();
        }
      }}
    />
  );
};

const SearchHeaderAction: React.FC = () => {
  const { setSearchOpen } = use(EditorContext);

  return (
    <IconButton
      aria-label="Close search"
      size="xxs"
      onClick={() => setSearchOpen(false)}
    >
      ✕
    </IconButton>
  );
};

export const searchSubView: SubView = {
  id: "search",
  title: "Search",
  icon: LuSearch,
  component: SearchContent,
  renderTitle: () => <SearchTitle />,
  renderHeaderAction: () => <SearchHeaderAction />,
  alwaysShowHeaderAction: true,
  main: true,
};
