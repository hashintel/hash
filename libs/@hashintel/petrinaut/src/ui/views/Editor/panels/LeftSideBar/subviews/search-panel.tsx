import fuzzysort from "fuzzysort";
import { use, useEffect, useRef, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import type { ComponentType, ReactNode } from "react";

const SearchIcon = () => <Icon name="search" />;

import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../constants/entity-icons";
import { focusLands } from "../../../../../worksheet/focus-flow";
import { useFocusMember } from "../../../../../worksheet/use-focus-member";
import { useFocusStops } from "../../../../../worksheet/use-focus-stops";

import type { SubView } from "../../../../../components/sub-view/types";
import type { FocusStop } from "../../../../../worksheet/use-focus-stops";
import type { SelectionItem } from "@hashintel/petrinaut-core";

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
    extensions,
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
    ...(extensions.colors
      ? types.map((t) => ({
          id: t.id,
          name: t.name,
          category: "Type",
          icon: TokenTypeIcon,
          iconColor: t.displayColor,
          selectionItem: { type: "type" as const, id: t.id },
        }))
      : []),
    ...(extensions.colors && extensions.dynamics
      ? differentialEquations.map((eq) => ({
          id: eq.id,
          name: eq.name,
          category: "Equation",
          icon: DifferentialEquationIcon,
          selectionItem: {
            type: "differentialEquation" as const,
            id: eq.id,
          },
        }))
      : []),
    ...(extensions.parameters
      ? parameters.map((p) => ({
          id: p.id,
          name: p.name,
          category: "Parameter",
          icon: ParameterIcon,
          selectionItem: { type: "parameter" as const, id: p.id },
        }))
      : []),
  ];
}

// -- Components ---------------------------------------------------------------

/**
 * The result rows, one member of the search panel's vertical focus flow:
 * arrows walk the rows and select as they move, and a move off the top edge
 * flows back into the search input above.
 */
const SearchResultsList: React.FC<{ results: SearchResult[] }> = ({
  results,
}) => {
  const { isSelected: checkIsSelected, selectItem } = use(EditorContext);
  const targets = useRef<Map<string, HTMLElement>>(new Map());

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
    focusTarget: (target) => focusLands(targets.current.get(target.stopId)),
  });

  return (
    <div ref={attach} className={resultListStyle} role="listbox">
      {results.map(({ item, highlighted }) => {
        const isSelected = checkIsSelected(item.id);
        return (
          <div
            key={item.id}
            ref={(element) => {
              if (element) {
                targets.current.set(item.id, element);
              } else {
                targets.current.delete(item.id);
              }
            }}
            role="option"
            tabIndex={tabIndexFor({ stopId: item.id, column: 0 })}
            aria-selected={isSelected}
            className={resultRowStyle({ isSelected })}
            onClick={() => selectItem(item.selectionItem)}
            onFocus={() => {
              onFocusTarget({ stopId: item.id, column: 0 });
              selectItem(item.selectionItem);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                selectItem(item.selectionItem);
                return;
              }
              onStopsKeyDown({ stopId: item.id, column: 0 })(event);
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
  );
};

const SearchContent: React.FC = () => {
  const { searchInputRef } = use(EditorContext);
  const allItems = useSearchableItems();
  const [query, setQuery] = useState("");

  // Sync query from the input (the input lives in SearchTitle, so we read its value)
  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }

    const handleInput = () => {
      setQuery(input.value);
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
const SearchTitle: React.FC = () => {
  const { isSearchOpen, searchInputRef } = use(EditorContext);
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
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveFrom("down");
        }
      }}
    />
  );
};

const SearchHeaderAction: React.FC = () => {
  const { setSearchOpen } = use(EditorContext);

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

export const searchSubView: SubView = {
  id: "search",
  title: "Search",
  icon: SearchIcon,
  component: SearchContent,
  renderTitle: () => <SearchTitle />,
  renderHeaderAction: () => <SearchHeaderAction />,
  alwaysShowHeaderAction: true,
  main: true,
};
