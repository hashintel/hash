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
 * places a selected result at a random point (see `network-graph-view.tsx`).
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

import { queryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { ArrowRightToLineIcon } from "../../../shared/icons/arrow-right-to-line-icon";
import { SearchIcon } from "../../../shared/icons/search-icon";
import { MenuItem } from "../../../shared/ui/menu-item";
import { GrayToBlueIconButton } from "../gray-to-blue-icon-button";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type { PropsWithChildren, RefObject } from "react";

/** Cap on results pulled per keystroke. */
const MAXIMUM_RESULTS = 25;
/** Debounce (ms) on the typed query before hitting the search endpoint. */
const SEARCH_DEBOUNCE_MS = 300;

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

/**
 * The left-anchored slide-in panel, copied from the old graph view's
 * `ControlPanel` so the two searches look identical.
 */
const SearchPanel = ({
  children,
  onClose,
  open,
  panelRef,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}>) => (
  <Box
    ref={panelRef}
    sx={{
      zIndex: 1,
      position: "absolute",
      left: 0,
      top: 0,
      transform: open ? "translateX(0%)" : "translateX(-100%)",
      maxHeight: ({ spacing }) => `calc(100% - ${spacing(4)})`,
      transition: ({ transitions }) => transitions.create(["transform"]),
      py: 1.2,
      background: ({ palette }) => palette.white,
      borderWidth: 1,
      borderColor: ({ palette }) => palette.gray[20],
      borderStyle: "solid",
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderLeftWidth: 1,
      borderBottomLeftRadius: 4,
      boxShadow: open ? ({ boxShadows }) => boxShadows.sm : undefined,
      minWidth: 180,
      overflowY: "auto",
    }}
  >
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      pr={1.8}
      pl={2}
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
        onClick={() => onClose()}
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
    {children}
  </Box>
);

export const NetworkGraphSearch = ({
  onSelect,
  popperContainer,
}: {
  onSelect: (result: NetworkGraphSearchResult) => void;
  /**
   * Element to portal the results popup into. The parent passes its frame so the
   * popup stays visible when the graph is taken full-screen (a body portal would
   * be hidden behind the full-screen element).
   */
  popperContainer?: HTMLElement | null;
}) => {
  const [open, setOpen] = useState(false);
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
      panel.ontransitionend = () => {
        inputRef.current?.focus();
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

  return (
    <>
      <SearchPanel
        open={open}
        onClose={() => setOpen(false)}
        panelRef={panelRef}
      >
        <Box sx={{ width: 460, px: 1.5, mt: 1 }}>
          <Autocomplete<NetworkGraphSearchResult, false, false, false>
            autoFocus={false}
            componentsProps={{
              paper: {
                sx: {
                  p: 0,
                  maxWidth: "90vw",
                  minWidth: "100%",
                  width: "fit-content",
                },
              },
              popper: {
                container: popperContainer ?? undefined,
                sx: {
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
            ListboxProps={{ sx: { maxHeight: 240 } }}
            loading={loading}
            onChange={(_event, option) => {
              setSelected(option);
              if (option) {
                onSelect(option);
              }
            }}
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
      </SearchPanel>
      <GrayToBlueIconButton
        onClick={() => setOpen(true)}
        sx={{ position: "absolute", top: 8, left: 8 }}
      >
        <SearchIcon />
      </GrayToBlueIconButton>
    </>
  );
};
