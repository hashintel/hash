/**
 * Search panel for the Atlas-tiled network graph view.
 *
 * Opened from the visualizer header's search button (the same button the table
 * view's search uses), it slides in from the left over the graph's top-left
 * corner — the same direction the table view's search box arrives from — as a
 * titled "Search" panel holding a compact autocomplete. Matching results
 * appear in a dropdown the user picks from before a selection is made.
 *
 * The data source differs from the table's visible-row search: the tiled graph
 * never holds its node list in full, so instead we query the graph over GraphQL
 * as the user types (debounced). We use the structural `queryEntities` endpoint
 * rather than the header bar's semantic `searchEntities` — the latter needs an
 * embedding client that isn't configured in local dev. `containsSegment` is
 * case-sensitive, so we match a few case variants of the query against the
 * common label properties and then refine case-insensitively on the generated
 * label. The results carry no coordinates, so the parent view locates each (by
 * entity id) to place and reveal a picked result — it prefetches the whole
 * result set via `onResultsChange` so a pick made while its locate is still
 * pending can share that request (see `network-graph-view.tsx`). A locate that
 * has already settled is deliberately fetched again for request-time detail.
 */

import { useQuery } from "@apollo/client";
import { useDebouncedState } from "@mantine/hooks";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

import { Autocomplete, IconButton } from "@hashintel/design-system";
import {
  deserializeQueryEntitiesResponse,
  getClosedMultiEntityTypeFromMap,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { ArrowRightToLineIcon } from "../../shared/icons/arrow-right-to-line-icon";
import { SearchIcon } from "../../shared/icons/search-icon";
import { MenuItem } from "../../shared/ui/menu-item";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

/** Cap on results pulled per keystroke. */
const MAXIMUM_RESULTS = 25;
/** Debounce (ms) on the typed query before hitting the search endpoint. */
const SEARCH_DEBOUNCE_MS = 300;

/** Width of the floating search panel. */
const PANEL_WIDTH = 340;

/** Inset of the panel from the graph frame's top-left corner. */
const PANEL_INSET = 8;

/**
 * The open panel layers around the selection popover, which sits at a
 * deliberately low base z-index (see `SELECTION_POPOVER_Z_INDEX`) so it — and
 * this panel with it — stay below app overlays like the entity drawer. Which of
 * the two is on top follows the last thing the user actioned (see the `elevated`
 * prop): focusing the panel raises it above the popover; selecting an item
 * drops it below so the popover shows on top. The results dropdown always sits
 * one step above the panel so it isn't clipped behind it.
 *
 * Kept in step with the selection popover's z-index (`LocatedEntityPopover`).
 */
const SELECTION_POPOVER_Z_INDEX = 50;
const PANEL_Z_ABOVE_POPOVER = SELECTION_POPOVER_Z_INDEX + 1;
const PANEL_Z_BELOW_POPOVER = SELECTION_POPOVER_Z_INDEX - 2;
const RESULTS_Z_ABOVE_POPOVER = SELECTION_POPOVER_Z_INDEX + 2;
const RESULTS_Z_BELOW_POPOVER = SELECTION_POPOVER_Z_INDEX - 1;

/**
 * The properties {@link generateEntityLabel} most commonly derives a label from —
 * covering CRM/generic entities (`name`), documents (`title`) and users
 * (`display-name`). We search these server-side; the label refine then keeps only
 * genuine matches.
 */
const LABEL_PROPERTY_BASE_URLS = [
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/",
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
] as BaseUrl[];

/** `containsSegment` matches byte-for-byte, so cover the usual casings. */
const caseVariants = (query: string): string[] => {
  const titleCased = query.replace(/\b\w/g, (char) => char.toUpperCase());
  return [
    ...new Set([query, query.toLowerCase(), query.toUpperCase(), titleCased]),
  ];
};

/** Match the query (any casing) as a substring of any common label property. */
const buildLabelSearchFilter = (query: string): Filter => ({
  any: LABEL_PROPERTY_BASE_URLS.flatMap((baseUrl) =>
    caseVariants(query).map((variant) => ({
      containsSegment: [
        { path: ["properties", baseUrl] },
        { parameter: variant },
      ],
    })),
  ),
});

/**
 * Drops link entities from the results. The graph renders links as edges, not
 * selectable nodes, and the pick pipeline locates each result by its source node
 * (see `network-graph-view.tsx`) — so a link entity that matched on a
 * `name`/`title`/`display-name` property would be a dead result that resolves to
 * nothing. A link entity is exactly one with a left endpoint, so exclude any whose
 * `leftEntity` resolves.
 */
const NON_LINK_ENTITY_FILTER: Filter = {
  not: { exists: { path: ["leftEntity", "uuid"] } },
};

export interface NetworkGraphSearchResult {
  entityId: EntityId;
  label: string;
}

export const NetworkGraphSearch = ({
  open,
  onClose,
  onSelect,
  onHover,
  onResultsChange,
  popperContainer,
  elevated = true,
  onActivate,
  filter,
}: {
  /** Whether the panel is shown. Toggled by the visualizer header's search button. */
  open: boolean;
  /** Fired by the panel's close button and the Escape key. */
  onClose: () => void;
  onSelect: (result: NetworkGraphSearchResult) => void;
  /**
   * Called with the result the user is currently highlighting in the dropdown (by
   * hover or keyboard), or `null` when none is. Lets the parent preview a result —
   * e.g. lighting up its node in the graph — before it's picked.
   */
  onHover?: (result: NetworkGraphSearchResult | null) => void;
  /**
   * Called with the current result set whenever it changes (empty when the query
   * clears). Lets the parent start each result's locate ego-graph so a hover or pick
   * can share it while it remains pending. Settled detail is not retained, so a
   * later interaction starts a fresh request.
   */
  onResultsChange?: (results: NetworkGraphSearchResult[]) => void;
  /**
   * Element to portal the results popup into. The parent passes its frame so the
   * popup stays visible when the graph is taken full-screen (a body portal would
   * be hidden behind the full-screen element).
   */
  popperContainer?: HTMLElement | null;
  /**
   * Whether the open panel sits above the selection popover. The parent flips
   * this by recency: true when the panel was last focused/opened, false once an
   * item is selected (so its popover shows on top).
   */
  elevated?: boolean;
  /**
   * Fired when the user focuses or clicks the panel, so the parent can bring it
   * back above the selection popover (by setting `elevated`).
   */
  onActivate?: () => void;
  /**
   * The header's entity-query filter, serialized as JSON — the same bytes the
   * graph's atlas session is bound to (see `network-graph-view.tsx`). When set,
   * search results are constrained to entities matching it as well as the typed
   * query, so the search only surfaces nodes the current view actually shows.
   */
  filter?: string;
}) => {
  const [inputValue, setInputValue] = useState("");
  const [selected, setSelected] = useState<NetworkGraphSearchResult | null>(
    null,
  );
  const [query, setQuery] = useDebouncedState("", SEARCH_DEBOUNCE_MS);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the input once the panel has finished sliding in — focusing earlier
  // mis-positions the dropdown mid-transition.
  useEffect(() => {
    const panel = panelRef.current;
    if (open && panel) {
      panel.ontransitionend = (event) => {
        if (event.target === panel && event.propertyName === "transform") {
          inputRef.current?.focus();
        }
      };
    }
    return () => {
      if (panel) {
        panel.ontransitionend = null;
      }
    };
  }, [open]);

  const trimmedQuery = query.trim();

  // The header filter, parsed back from its serialized bytes. Combined with the
  // label filter below so the search covers only the current view; a malformed
  // value (shouldn't happen) is ignored rather than breaking the search.
  const viewFilter = useMemo<Filter | null>(() => {
    if (!filter) {
      return null;
    }
    try {
      return JSON.parse(filter) as Filter;
    } catch {
      return null;
    }
  }, [filter]);

  const { data, loading } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter: {
          all: [
            NON_LINK_ENTITY_FILTER,
            ...(viewFilter ? [viewFilter] : []),
            buildLabelSearchFilter(trimmedQuery),
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeEntityTypes: "resolved",
        includePermissions: false,
        limit: MAXIMUM_RESULTS,
      },
    },
    skip: !trimmedQuery,
  });

  const options = useMemo<NetworkGraphSearchResult[]>(() => {
    // Apollo retains the last `data` after `skip` flips back to true, so an empty
    // needle would match every previous label via `includes("")`. Bail on an empty
    // query so clearing the input clears the results rather than resurfacing them.
    if (!trimmedQuery || !data) {
      return [];
    }
    const { entities, closedMultiEntityTypes } =
      deserializeQueryEntitiesResponse(data.queryEntities);
    if (!closedMultiEntityTypes) {
      return [];
    }

    const needle = trimmedQuery.toLowerCase();
    const seen = new Set<string>();
    const results: NetworkGraphSearchResult[] = [];

    for (const entity of entities) {
      const entityId = entity.metadata.recordId.entityId;
      if (seen.has(entityId)) {
        continue;
      }
      const label = generateEntityLabel(
        getClosedMultiEntityTypeFromMap(
          closedMultiEntityTypes,
          entity.metadata.entityTypeIds,
        ),
        entity,
      );
      // The case-variant server filter can match a property the label doesn't
      // use; keep only results whose displayed label actually contains the query.
      if (!label.toLowerCase().includes(needle)) {
        continue;
      }
      seen.add(entityId);
      results.push({ entityId, label });
    }

    return results;
  }, [data, trimmedQuery]);

  // Hand the current matches to the parent so it can prefetch each result's
  // locate ego-graph while the user is still choosing.
  useEffect(() => {
    onResultsChange?.(options);
  }, [options, onResultsChange]);

  // Keep the controlled value present in the option list so MUI never warns that
  // the selection is missing once the query (and thus the results) moves on.
  const displayedOptions = useMemo<NetworkGraphSearchResult[]>(() => {
    if (
      selected &&
      !options.some((option) => option.entityId === selected.entityId)
    ) {
      return [selected, ...options];
    }
    return options;
  }, [options, selected]);

  const panelZIndex = elevated ? PANEL_Z_ABOVE_POPOVER : PANEL_Z_BELOW_POPOVER;
  const resultsZIndex = elevated
    ? RESULTS_Z_ABOVE_POPOVER
    : RESULTS_Z_BELOW_POPOVER;

  return (
    // A clipping container pinned at the graph's top-left corner: the panel
    // slides in from (and out past) its left edge, so mid-transition it never
    // spills outside the graph frame. The padding leaves room for the panel's
    // shadow at rest; `pointerEvents: none` keeps the clipped area from
    // swallowing graph interactions.
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        overflow: "hidden",
        pointerEvents: "none",
        pt: `${PANEL_INSET}px`,
        pl: `${PANEL_INSET}px`,
        pr: 2,
        pb: 2,
        zIndex: panelZIndex,
      }}
    >
      <Box
        ref={panelRef}
        // Any pointer/keyboard focus on the panel brings it back to the front
        // (the results popup portals elsewhere, so picking a result doesn't fire
        // this — the parent lowers the panel on select instead).
        onMouseDown={() => onActivate?.()}
        onFocus={() => onActivate?.()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        sx={({ palette, boxShadows, transitions }) => ({
          width: PANEL_WIDTH,
          pointerEvents: open ? "auto" : "none",
          background: palette.white,
          border: `1px solid ${palette.gray[30]}`,
          // Match the other graph controls: a rounded square, not a circle.
          borderRadius: "4px",
          boxShadow: boxShadows.sm,
          // The slide-from-the-left: fully past the container's clip edge when
          // closed, in place when open. `visibility` rides the transition so the
          // panel stays visible while sliding out but can't be tabbed into once
          // hidden.
          transform: open
            ? "translateX(0)"
            : `translateX(calc(-100% - ${PANEL_INSET}px))`,
          visibility: open ? "visible" : "hidden",
          transition: transitions.create(["transform", "visibility"]),
        })}
      >
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          sx={{ minHeight: 34, pt: 0.75, pl: 2, pr: 1 }}
        >
          <Box>
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[90],
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.3,
              }}
            >
              Search
            </Typography>
            {viewFilter ? (
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 10,
                  lineHeight: 1.3,
                  mb: 1,
                }}
              >
                Limited to current filters
              </Typography>
            ) : null}
          </Box>
          <IconButton
            aria-label="Close search"
            onClick={onClose}
            sx={{
              padding: 0.5,
              svg: {
                fontSize: 16,
                color: ({ palette }) => palette.gray[50],
              },
            }}
          >
            <ArrowRightToLineIcon />
          </IconButton>
        </Stack>
        <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
          <Autocomplete<NetworkGraphSearchResult, false, false, false>
            autoFocus={false}
            componentsProps={{
              paper: {
                // Match the dropdown to the input width rather than letting it
                // grow to fit the option text.
                sx: {
                  p: 0,
                  width: "100%",
                },
              },
              popper: {
                container: popperContainer ?? undefined,
                sx: {
                  // One step above the panel (which layers around the selection
                  // popover by recency), so results aren't hidden behind it.
                  zIndex: resultsZIndex,
                  "& > div:first-of-type": {
                    boxShadow: "none",
                  },
                },
              },
            }}
            filterOptions={(unfiltered) => unfiltered}
            getOptionLabel={(option) => option.label}
            inputHeight="auto"
            inputProps={{
              endAdornment: (
                <SearchIcon
                  sx={{
                    fontSize: 16,
                    color: ({ palette }) => palette.gray[30],
                  }}
                />
              ),
              placeholder: "Search for node...",
              sx: () => ({
                height: "auto",
                [`&.${outlinedInputClasses.root}`]: {
                  py: 0.3,
                  px: "8px !important",
                  input: {
                    fontSize: 14,
                  },
                },
              }),
            }}
            inputRef={inputRef}
            inputValue={inputValue}
            isOptionEqualToValue={(option, value) =>
              option.entityId === value.entityId
            }
            ListboxProps={{
              sx: { maxHeight: 240 },
              // `onHighlightChange` only clears (fires `null`) when the popup
              // closes or another option is highlighted, not when the pointer
              // leaves the list while it stays open — so clear the preview here.
              onMouseLeave: () => onHover?.(null),
            }}
            loading={loading}
            onChange={(_event, option) => {
              setSelected(option);
              if (option) {
                onSelect(option);
              }
            }}
            onHighlightChange={(_event, option) => onHover?.(option)}
            onInputChange={(_event, value, reason) => {
              setInputValue(value);
              if (reason === "input") {
                setQuery(value);
              }
            }}
            options={displayedOptions}
            renderOption={({ key: _key, ...props }, option) => (
              <MenuItem
                {...props}
                key={option.entityId}
                value={option.entityId}
              >
                {option.label}
              </MenuItem>
            )}
            value={selected}
          />
        </Box>
      </Box>
    </Box>
  );
};
