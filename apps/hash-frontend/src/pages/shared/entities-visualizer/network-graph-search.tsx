/**
 * Search control for the Atlas-tiled network graph view.
 *
 * Copies the old (Sigma) graph view's search UX exactly: it starts collapsed to
 * a search icon, which opens a "Search" panel that slides in from the left and
 * holds a compact autocomplete. Matching results appear in a dropdown the user
 * picks from before a selection is made.
 *
 * The one difference is the data source: the old view filtered an in-memory node
 * list, which the tiled graph never holds in full, so instead we query the graph
 * over GraphQL as the user types (debounced). We use the structural
 * `queryEntities` endpoint rather than the header bar's semantic `searchEntities`
 * — the latter needs an embedding client that isn't configured in local dev.
 * `containsSegment` is case-sensitive, so we match a few case variants of the
 * query against the common label properties and then refine case-insensitively
 * on the generated label. The results carry no coordinates, so the parent view
 * locates each (by entity id) to place and reveal a picked result — it prefetches
 * the whole result set via `onResultsChange` so a pick is instant (see
 * `network-graph-view.tsx`).
 */

import { useQuery } from "@apollo/client";
import { useDebouncedState } from "@mantine/hooks";
import {
  Box,
  ButtonBase,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

import { Autocomplete, IconButton } from "@hashintel/design-system";
import {
  deserializeQueryEntitiesResponse,
  getClosedMultiEntityTypeFromMap,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { ArrowRightToLineIcon } from "../../../shared/icons/arrow-right-to-line-icon";
import { SearchIcon } from "../../../shared/icons/search-icon";
import { MenuItem } from "../../../shared/ui/menu-item";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

/** Cap on results pulled per keystroke. */
const MAXIMUM_RESULTS = 25;
/** Debounce (ms) on the typed query before hitting the search endpoint. */
const SEARCH_DEBOUNCE_MS = 300;

/** Diameter of the collapsed search button, which grows into the panel. */
const COLLAPSED_SIZE = 30;
/** Size of the expanded (floating) search panel. */
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 82;

/**
 * The open widget layers around the selection popover, which sits at a
 * deliberately low base z-index (see `SELECTION_POPOVER_Z_INDEX`) so it — and
 * this widget with it — stay below app overlays like the entity drawer. Which of
 * the two is on top follows the last thing the user actioned (see the `elevated`
 * prop): focusing the widget raises it above the popover; selecting an item
 * drops it below so the popover shows on top. The results dropdown always sits
 * one step above the panel so it isn't clipped behind it. Collapsed, the button
 * stays below the popover regardless (its z-index is a plain `1`).
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

export interface NetworkGraphSearchResult {
  entityId: EntityId;
  label: string;
}

export const NetworkGraphSearch = ({
  onSelect,
  onHover,
  onResultsChange,
  popperContainer,
  elevated = true,
  onActivate,
}: {
  onSelect: (result: NetworkGraphSearchResult) => void;
  /**
   * Called with the result the user is currently highlighting in the dropdown (by
   * hover or keyboard), or `null` when none is. Lets the parent preview a result —
   * e.g. lighting up its node in the graph — before it's picked.
   */
  onHover?: (result: NetworkGraphSearchResult | null) => void;
  /**
   * Called with the current result set whenever it changes (empty when the query
   * clears). Lets the parent prefetch each result's locate ego-graph so a later
   * pick renders without an on-demand round trip.
   */
  onResultsChange?: (results: NetworkGraphSearchResult[]) => void;
  /**
   * Element to portal the results popup into. The parent passes its frame so the
   * popup stays visible when the graph is taken full-screen (a body portal would
   * be hidden behind the full-screen element).
   */
  popperContainer?: HTMLElement | null;
  /**
   * Whether the open widget sits above the selection popover. The parent flips
   * this by recency: true when the widget was last focused/opened, false once an
   * item is selected (so its popover shows on top). Ignored while collapsed.
   */
  elevated?: boolean;
  /**
   * Fired when the user focuses or clicks the widget, so the parent can bring it
   * back above the selection popover (by setting `elevated`).
   */
  onActivate?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selected, setSelected] = useState<NetworkGraphSearchResult | null>(
    null,
  );
  const [query, setQuery] = useDebouncedState("", SEARCH_DEBOUNCE_MS);
  // The expanded height is measured from the content so the box grows to exactly
  // fit it (bottom padding included) rather than clipping at a guessed constant.
  const [panelHeight, setPanelHeight] = useState(PANEL_HEIGHT);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setPanelHeight(content.offsetHeight);
    });
    observer.observe(content);
    setPanelHeight(content.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // Focus the input once the panel has finished growing — focusing earlier
  // mis-positions the dropdown mid-transition.
  useEffect(() => {
    const panel = panelRef.current;
    if (open && panel) {
      panel.ontransitionend = (event) => {
        if (event.target === panel && event.propertyName === "width") {
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

  const { data, loading } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter: buildLabelSearchFilter(trimmedQuery),
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
    if (!data) {
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

  const openPanelZIndex = elevated
    ? PANEL_Z_ABOVE_POPOVER
    : PANEL_Z_BELOW_POPOVER;
  const resultsZIndex = elevated
    ? RESULTS_Z_ABOVE_POPOVER
    : RESULTS_Z_BELOW_POPOVER;

  return (
    // A single floating element pinned at the graph's top-left gap: it reads as
    // the collapsed search button and grows in place into the search panel.
    <Box
      ref={panelRef}
      // Any pointer/keyboard focus on the widget brings it back to the front
      // (the results popup portals elsewhere, so picking a result doesn't fire
      // this — the parent lowers the widget on select instead).
      onMouseDown={() => onActivate?.()}
      onFocus={() => onActivate?.()}
      sx={({ palette, boxShadows, transitions }) => ({
        position: "absolute",
        top: 8,
        left: 8,
        // Collapsed, the button stays below the selection popover; open, it
        // layers above or below it by recency (see `elevated`).
        zIndex: open ? openPanelZIndex : 1,
        overflow: "hidden",
        background: palette.white,
        border: `1px solid ${palette.gray[30]}`,
        // Match the other graph controls: a rounded square, not a circle.
        borderRadius: "4px",
        boxShadow: open ? boxShadows.sm : "none",
        color: palette.gray[70],
        width: open ? PANEL_WIDTH : COLLAPSED_SIZE,
        height: open ? panelHeight : COLLAPSED_SIZE,
        transition: transitions.create([
          "width",
          "height",
          "box-shadow",
          "background-color",
          "border-color",
        ]),
        "&:hover": open
          ? undefined
          : {
              background: palette.blue[10],
              borderColor: palette.blue[25],
              color: palette.blue[70],
            },
      })}
    >
      {/* Expanded panel content — a fixed width so it doesn't reflow as the
          box grows, and fades in once there's room for it. */}
      <Box
        ref={contentRef}
        sx={({ transitions }) => ({
          width: PANEL_WIDTH,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: transitions.create(["opacity"]),
        })}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ height: 34, pl: 2, pr: 1 }}
        >
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[90],
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Search
          </Typography>
          <IconButton
            aria-label="Close search"
            onClick={() => setOpen(false)}
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

      {/* Collapsed trigger — the icon the panel grows out of. */}
      <ButtonBase
        aria-label="Search"
        disableRipple
        onClick={() => setOpen(true)}
        sx={({ transitions }) => ({
          position: "absolute",
          top: 0,
          left: 0,
          width: COLLAPSED_SIZE,
          height: COLLAPSED_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "inherit",
          opacity: open ? 0 : 1,
          pointerEvents: open ? "none" : "auto",
          transition: transitions.create(["opacity"]),
        })}
      >
        <SearchIcon sx={{ fontSize: 14, color: "inherit" }} />
      </ButtonBase>
    </Box>
  );
};
