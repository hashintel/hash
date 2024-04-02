import { useQuery } from "@apollo/client";
import type { EntityType } from "@blockprotocol/type-system";
import { Chip, IconButton } from "@hashintel/design-system";
import type { Filter } from "@local/hash-graph-client";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  Entity,
  EntityRootType,
  EntityTypeRootType,
  Subgraph,
} from "@local/hash-subgraph";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce, useKey, useOutsideClickRef } from "rooks";

import { useUserOrOrgShortnameByOwnedById } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import { generateLinkParameters } from "../../generate-link-parameters";
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
        href={`/@${entityOwningShortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`}
      >
        {generateEntityLabel(subgraph, entity)}
        {entityType && (
          <Chip
            color="teal"
            label={entityType.schema.title}
            sx={{ cursor: "pointer", ml: 1 }}
          />
        )}
      </Link>
    </ResultItem>
  );
};

const EntityTypeResult: FunctionComponent<{
  entityType: EntityType;
}> = ({ entityType }) => {
  return (
    <ResultItem>
      <Link noLinkStyle href={generateLinkParameters(entityType.$id)}>
        {entityType.title}
        <Chip
          color="aqua"
          label="Entity Type"
          sx={{ cursor: "pointer", ml: 1 }}
        />
      </Link>
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
        {
          parameter: submittedQuery,
        },
        { parameter: maximumSemanticDistance },
      ],
    }),
    [submittedQuery],
  );

  const { data: entityResultData, loading: entitiesLoading } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      query: {
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

  const entitySubgraph =
    entityResultData &&
    isEntityRootedSubgraph(entityResultData.structuralQueryEntities.subgraph)
      ? entityResultData.structuralQueryEntities.subgraph
      : undefined;

  const entityResults = entitySubgraph ? getRoots(entitySubgraph) : [];

  const entityTypeSubgraph =
    entityTypeResultData &&
    /**
     * Ideally we would use {@link isEntityTypeRootedSubgraph} here, but we cannot because one of the checks it makes
     * is that the root's revisionId is a stringified integer. In HASH, the revisionId for a type root is a number.
     * Either the types in @blockprotocol/graph or the value delivered by HASH needs to change
     * H-2489
     */
    (entityTypeResultData.queryEntityTypes as Subgraph<EntityTypeRootType>);

  const entityTypeResults = entityTypeSubgraph
    ? getRoots(entityTypeSubgraph)
    : [];

  useKey(["Escape"], () => setResultListVisible(false));

  const [rootRef] = useOutsideClickRef(() => setResultListVisible(false));

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
          {submittedQuery !== displayedQuery ? null : isLoading ? (
            <ResultItem sx={{ display: "block" }}>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : !entityResults.length && !entityTypeResults.length ? (
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
                  />
                );
              })}
              {entityResults.map((entity) => {
                return (
                  <EntityResult
                    key={entity.metadata.recordId.entityId}
                    entity={entity}
                    subgraph={entitySubgraph!}
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
