import type { FunctionComponent, ReactNode , useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce, useKey, useOutsideClickRef } from "rooks";
import { useQuery } from "@apollo/client";
import type { EntityType } from "@blockprotocol/type-system";
import { Chip, IconButton } from "@hashintel/design-system";
import type { Filter } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  EntityRootType,
  EntityTypeRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,  Subgraph} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getRoots,
  isEntityRootedSubgraph,
} from "@local/hash-subgraph/stdlib";
import type { Box, SxProps, Theme , useMediaQuery, useTheme } from "@mui/material";

import { useUserOrOrgShortnameByOwnedById } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import { generateLinkParameters } from "../../generate-link-parameters";
import { SearchIcon } from "../../icons";
import { Button, Link } from "../../ui";

import { SearchInput } from "./search-bar/search-input";

/**
 * Finds the query's words in the result and chops it into parts at the words' boundaries.
 *
 * @todo Reintroduce this for entities with textual-content – H-2258
 *    bear in mind that text may not contain the search term, given that it's semantic search.
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
    component={"ul"}
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
      component={"li"}
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

const chipStyles = { cursor: "pointer !important", ml: 1 };

const EntityResult: FunctionComponent<{
  entity: Entity;
  onClick: () => void;
  subgraph: Subgraph<EntityRootType>;
}> = ({ entity, onClick, subgraph }) => {
  const {entityId} = entity.metadata.recordId;

  const ownedById = extractOwnedByIdFromEntityId(entityId);
  const { shortname: entityOwningShortname } = useUserOrOrgShortnameByOwnedById(
    { ownedById },
  );

  const entityType = getEntityTypeById(subgraph, entity.metadata.entityTypeId);

  return (
    <Link
      noLinkStyle
      href={`/@${entityOwningShortname}/entities/${extractEntityUuidFromEntityId(
        entityId,
      )}`}
      onClick={onClick}
    >
      <ResultItem>
        {generateEntityLabel(subgraph, entity)}
        {entityType && (
          <Chip color={"teal"} label={entityType.schema.title} sx={chipStyles} />
        )}
      </ResultItem>
    </Link>
  );
};

const EntityTypeResult: FunctionComponent<{
  entityType: EntityType;
  onClick: () => void;
}> = ({ entityType, onClick }) => {
  return (
    <Link
      noLinkStyle
      href={generateLinkParameters(entityType.$id)}
      onClick={onClick}
    >
      <ResultItem>
        {entityType.title}
        <Chip color={"aqua"} label={"Entity Type"} sx={chipStyles} />
      </ResultItem>
    </Link>
  );
};

/** Extends react's useState by returning an additional value updated after a short delay (debounce) */
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
        zIndex: ({ zIndex }) => zIndex.drawer + 5,
        left: 0,
        top: "12px",
        px: 2,
      };
    }
 
      return {
        mr: 1,
      };
    
  }

  return {};
};

/**
 * The maximum distance between the search query and an entity's embedding for it to appear in results.
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
        {
          parameter: submittedQuery,
        },
        { parameter: maximumSemanticDistance },
      ],
    }),
    [submittedQuery],
  );

  const { data: entityResultData, loading: entitiesLoading } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      request: {
        filter: queryFilter,
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

  const { data: entityTypeResultData, loading: entityTypesLoading } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    variables: {
      filter: queryFilter,
      latestOnly: true,
      ...zeroedGraphResolveDepths,
    },
    skip: !submittedQuery,
  });

  const deserializedEntitySubgraph = entityResultData
    ? deserializeSubgraph(entityResultData.getEntitySubgraph.subgraph)
    : undefined;
  const entitySubgraph =
    deserializedEntitySubgraph &&
    isEntityRootedSubgraph(deserializedEntitySubgraph)
      ? deserializedEntitySubgraph
      : undefined;
  const entityResults = entitySubgraph ? getRoots(entitySubgraph) : [];

  const entityTypeSubgraph =
    entityTypeResultData &&
    /**
     * Ideally we would use {@link isEntityTypeRootedSubgraph} here, but we cannot because one of the checks it makes
     * is that the root's revisionId is a stringified integer. In HASH, the revisionId for a type root is a number.
     * Either the types in @blockprotocol/graph or the value delivered by HASH needs to change
     * H-2489.
     */
    deserializeSubgraph<EntityTypeRootType>(
      entityTypeResultData.queryEntityTypes,
    );

  const entityTypeResults = entityTypeSubgraph
    ? getRoots(entityTypeSubgraph)
    : [];

  useKey(["Escape"], () => { setResultListVisible(false); });

  const [rootRef] = useOutsideClickRef(() => { setResultListVisible(false); });

  const isLoading = entityTypesLoading || entitiesLoading;

  return (
    <Box
      ref={rootRef}
      sx={{
        marginLeft: 0,
        [theme.breakpoints.up("md")]: {
          marginLeft: theme.spacing(3),
        },
        position: "relative",
        height: "100%",
        ...getSearchBarResponsiveStyles(isMobile, displaySearchInput),
      }}
    >
      {/* If the user is in mobile view and the search icon isn't clicked, display the icon */}
      {isMobile && !displaySearchInput ? (
        <IconButton size={"medium"} onClick={() => { setDisplaySearchInput(true); }}>
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
              variant={"tertiary_quiet"}
              size={"xs"}
              sx={{ ml: 1 }}
              onClick={() => {
                setQueryText("");
                setDisplaySearchInput(false);
              }}
            >
              Cancel
            </Button>
          )}
        </Box>
      )}

      {isResultListVisible && displayedQuery && (
        <ResultList isMobile={isMobile}>
          {submittedQuery !== displayedQuery ? null : isLoading ? (
            <ResultItem sx={{ display: "block" }}>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : entityResults.length === 0 && entityTypeResults.length === 0 ? (
            <ResultItem sx={{ display: "block" }}>
              No results found for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : (
            <>
              {entityTypeResults.map((entityType) => {
                return (
                  <EntityTypeResult
                    entityType={entityType.schema}
                    key={entityType.schema.$id}
                    onClick={() => { setResultListVisible(false); }}
                  />
                );
              })}
              {entityResults.map((entity) => {
                return (
                  <EntityResult
                    key={entity.metadata.recordId.entityId}
                    entity={entity}
                    subgraph={entitySubgraph!}
                    onClick={() => { setResultListVisible(false); }}
                  />
                );
              })}
            </>
          )}
        </ResultList>
      )}
    </Box>
  );
};
