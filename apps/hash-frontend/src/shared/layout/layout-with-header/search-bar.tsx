import { useQuery } from "@apollo/client";
import { useClickOutside, useDebouncedState, useHotkeys } from "@mantine/hooks";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import { IconButton } from "@hashintel/design-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import { SearchIcon } from "../../icons";
import { Button } from "../../ui";
import { SearchInput } from "./search-bar/search-input";
import { SearchResults } from "./search-bar/search-results";
import { useSearchBarEntities } from "./search-bar/use-search-bar-entities";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { Filter } from "@local/hash-graph-client";
import type { SxProps, Theme } from "@mui/material";
import type { FunctionComponent } from "react";

/**
 * finds the query's words in the result and chops it into parts at the words' boundaries
 * @todo reintroduce this for entities with textual-content – H-2258
 *    bear in mind that text may not contain the search term, given that it's semantic search
 */
// const splitByMatches = (result: string, query: string) => {
//   const separator = query
//     .split(/\s+/g)
//     .sort((a, b) => b.length - a.length) // match longer words first
//     .map(escapeRegExp)
//     .join("|");
//
//   /** @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split#splitting_with_a_regexp_to_include_parts_of_the_separator_in_the_result */
//   return result.split(new RegExp(`(${separator})`, "gi"));
// };

/** extends react's useState by returning an additional value updated after a short delay (debounce) */
const useQueryText = (): [string, string, (queryText: string) => void] => {
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useDebouncedState("", 300);

  const setQuery = useCallback(
    (query: string) => {
      setDisplayedQuery(query);
      setSubmittedQuery(query);
    },
    [setDisplayedQuery, setSubmittedQuery],
  );

  return [displayedQuery, submittedQuery, setQuery];
};

const getSearchBarResponsiveStyles = (
  isMobile: boolean,
  displaySearchInput: boolean,
): SxProps<Theme> => {
  if (isMobile) {
    if (displaySearchInput) {
      return {
        position: "absolute",
        width: "100%",
        zIndex: ({ zIndex }) => zIndex.drawer + 5,
        left: 0,
        top: "12px",
        px: 2,
      };
    } else {
      return {
        mr: 1,
      };
    }
  }

  return {};
};

/**
 * The maximum distance between the search query and an entity's embedding for it to appear in results
 */
const maximumSemanticDistance = 0.7;

export const SearchBar: FunctionComponent = () => {
  const theme = useTheme();

  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [isResultListVisible, setResultListVisible] = useState(false);
  const [displayedQuery, submittedQuery, setQueryText] = useQueryText();

  const [displaySearchInput, setDisplaySearchInput] = useState<boolean>(false);

  useEffect(() => {
    if (displayedQuery.trim() && !displaySearchInput) {
      setDisplaySearchInput(true);
    }
  }, [displayedQuery, displaySearchInput]);

  const queryFilter: Filter = useMemo(
    () => ({
      cosineDistance: [
        { path: ["embedding"] },
        { parameter: submittedQuery },
        { parameter: maximumSemanticDistance },
      ],
    }),
    [submittedQuery],
  );

  const {
    entities: entityResults,
    subgraph: entitySubgraph,
    initialLoading: entitiesLoading,
    loadingMore,
    loadMore,
    hasMore,
  } = useSearchBarEntities({
    filter: queryFilter,
    resetKey: submittedQuery,
    skip: !submittedQuery,
  });

  const { data: entityTypeResultData, loading: entityTypesLoading } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    variables: {
      request: {
        filter: queryFilter,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    skip: !submittedQuery,
  });

  const entityTypeResults =
    (entityTypeResultData &&
      entityTypeResultData.queryEntityTypes.entityTypes) ??
    [];

  useHotkeys([["Escape", () => setResultListVisible(false)]]);

  const boxRef = useClickOutside<HTMLDivElement>(() =>
    setResultListVisible(false),
  );

  const isLoading = entityTypesLoading || entitiesLoading;

  return (
    <Box
      sx={{
        marginLeft: 0,
        [theme.breakpoints.up("md")]: {
          marginLeft: theme.spacing(3),
        },
        position: "relative",
        height: "100%",
        ...getSearchBarResponsiveStyles(isMobile, displaySearchInput),
      }}
      ref={boxRef}
    >
      {/* If the user is in mobile view and the search icon isn't clicked, display the icon */}
      {isMobile && !displaySearchInput ? (
        <IconButton size="medium" onClick={() => setDisplaySearchInput(true)}>
          <SearchIcon />
        </IconButton>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            background: "white",
          }}
        >
          <SearchInput
            displayedQuery={displayedQuery}
            isMobile={isMobile}
            setQueryText={setQueryText}
            setResultListVisible={setResultListVisible}
          />

          {isMobile && (
            <Button
              onClick={() => {
                setQueryText("");
                setDisplaySearchInput(false);
              }}
              variant="tertiary_quiet"
              size="xs"
              sx={{ ml: 1 }}
            >
              Cancel
            </Button>
          )}
        </Box>
      )}

      <SearchResults
        isMobile={isMobile}
        visible={isResultListVisible}
        displayedQuery={displayedQuery}
        submittedQuery={submittedQuery}
        loading={isLoading}
        entityTypes={entityTypeResults.map((entityType) => entityType.schema)}
        entities={entityResults}
        entitySubgraph={entitySubgraph}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onClose={() => setResultListVisible(false)}
      />
    </Box>
  );
};
