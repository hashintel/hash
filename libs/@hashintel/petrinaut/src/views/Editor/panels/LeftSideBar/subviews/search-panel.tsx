import { css, cva } from "@hashintel/ds-helpers/css";
import fuzzysort from "fuzzysort";
import type { ComponentType, ReactNode } from "react";
import { use, useEffect, useMemo, useState } from "react";
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

  return useMemo(
    () => [
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
    ],
    [places, transitions, types, differentialEquations, parameters],
  );
}

// -- Components ---------------------------------------------------------------

const SearchContent: React.FC = () => {
  const { isSelected: checkIsSelected, selectItem } = use(EditorContext);
  const allItems = useSearchableItems();
  const [query, setQuery] = useState("");

  const { searchInputRef } = use(EditorContext);

  // Sync query from the input (the input lives in SearchTitle, so we read its value)
  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }

    const handleInput = () => setQuery(input.value);
    input.addEventListener("input", handleInput);
    setQuery(input.value);
    return () => input.removeEventListener("input", handleInput);
  }, [searchInputRef]);

  const results: SearchResult[] = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      return allItems.map((item) => ({ item, highlighted: item.name }));
    }

    const fuzzyResults = fuzzysort.go(trimmed, allItems, {
      key: "name",
      threshold: -1000,
    });

    return fuzzyResults.map((result) => ({
      item: result.obj,
      highlighted:
        fuzzysort.highlight(result[0], (match, i: number) => (
          <span key={i} className={highlightStyle}>
            {match}
          </span>
        )) ?? result.obj.name,
    }));
  }, [query, allItems]);

  const matchLabel =
    query.trim() === ""
      ? `${results.length} items`
      : `${results.length} match${results.length === 1 ? "" : "es"}`;

  return (
    <>
      <div className={matchCountStyle}>{matchLabel}</div>
      {results.length > 0 ? (
        <div className={resultListStyle}>
          {results.map(({ item, highlighted }) => {
            const isSelected = checkIsSelected(item.id);
            return (
              <div
                key={item.id}
                className={resultRowStyle({ isSelected })}
                onClick={() => selectItem(item.selectionItem)}
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
      ) : (
        <div className={emptyResultsStyle}>No matches</div>
      )}
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
