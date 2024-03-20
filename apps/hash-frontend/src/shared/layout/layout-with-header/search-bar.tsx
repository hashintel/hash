import { useQuery } from "@apollo/client";
import { Chip, IconButton } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getRoots,
  isEntityRootedSubgraph,
} from "@local/hash-subgraph/stdlib";
import type { SxProps, Theme } from "@mui/material";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useDebounce, useKey, useOutsideClickRef } from "rooks";

import { useUserOrOrgShortnameByOwnedById } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { SearchIcon } from "../../icons";
import { Button, Link } from "../../ui";
import { SearchInput } from "./search-bar/search-input";

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

const ResultList: FunctionComponent<{
  isMobile: boolean;
  children?: ReactNode;
}> = ({ isMobile, ...props }) => (
  <Box
    component="ul"
    sx={(theme) => ({
      position: !isMobile ? "absolute" : "unset",
      top: !isMobile ? "calc(100% + 1px)" : "unset",
      zIndex: 10_000,
      width: "100%",
      maxHeight: "15rem",
      overflow: "auto",
      border: `1px solid ${theme.palette.gray[20]}`,
      borderRadius: "0.5rem",
      boxShadow: theme.shadows[1],
    })}
  >
    {props.children}
  </Box>
);

const ResultItem: FunctionComponent<{
  sx?: SxProps<Theme>;
  children?: ReactNode;
}> = ({ sx = [], ...props }) => {
  const theme = useTheme();

  return (
    <Box
      component="li"
      sx={[
        {
          display: "flex",
          backgroundColor: theme.palette.gray[10],
          border: "none",
          padding: 1,
          cursor: "pointer",
          textOverflow: "ellipsis",
          overflow: "hidden",
          "&:hover": {
            backgroundColor: theme.palette.gray[20],
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
};

const EntityResult: FunctionComponent<{
  entity: Entity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ entity, subgraph }) => {
  const entityId = entity.metadata.recordId.entityId;

  const ownedById = extractOwnedByIdFromEntityId(entityId);
  const { shortname: entityOwningShortname } = useUserOrOrgShortnameByOwnedById(
    { ownedById },
  );

  const entityType = getEntityTypeById(subgraph, entity.metadata.entityTypeId);

  return (
    <ResultItem>
      <Link
        noLinkStyle
        href={`/@${entityOwningShortname}/entities/${extractEntityUuidFromEntityId(entityId)}`}
      >
        {generateEntityLabel(subgraph, entity)}
      </Link>
      {entityType && (
        <Chip color="teal" label={entityType.schema.title} sx={{ ml: 1 }} />
      )}
    </ResultItem>
  );
};

/** extends react's useState by returning an additional value updated after a short delay (debounce) */
const useQueryText = (): [string, string, (queryText: string) => void] => {
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const setSubmittedQuerySoon = useDebounce(setSubmittedQuery, 300);

  const setQuery = useCallback(
    (query: string) => {
      setDisplayedQuery(query);
      setSubmittedQuerySoon(query);
    },
    [setDisplayedQuery, setSubmittedQuerySoon],
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
        zIndex: 1,
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
const maximumSemanticDistance = 0.8;

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

  const { data: resultData, loading } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      query: {
        filter: {
          cosineDistance: [
            { path: ["embedding"] },
            {
              parameter: submittedQuery,
            },
            { parameter: maximumSemanticDistance },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
        },
        includeDrafts: false,
      },
      includePermissions: false,
    },
    skip: !submittedQuery,
  });

  const subgraph =
    resultData &&
    isEntityRootedSubgraph(resultData.structuralQueryEntities.subgraph)
      ? resultData.structuralQueryEntities.subgraph
      : undefined;

  const results = subgraph ? getRoots(subgraph) : [];

  useKey(["Escape"], () => setResultListVisible(false));

  const [rootRef] = useOutsideClickRef(() => setResultListVisible(false));

  const isLoading = loading || displayedQuery !== submittedQuery;

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
      ref={rootRef}
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
            zIndex: 1,
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

      {isResultListVisible && displayedQuery && (
        <ResultList isMobile={isMobile}>
          {isLoading ? (
            <ResultItem sx={{ display: "block" }}>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : !results.length ? (
            <ResultItem sx={{ display: "block" }}>
              No results found for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : (
            results.map((entity) => {
              return (
                <EntityResult
                  key={entity.metadata.recordId.entityId}
                  entity={entity}
                  subgraph={subgraph!}
                />
              );
            })
          )}
        </ResultList>
      )}
    </Box>
  );
};
