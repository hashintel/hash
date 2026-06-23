import { Box, CircularProgress, Stack, useTheme } from "@mui/material";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { getEntityTypeById } from "@blockprotocol/graph/stdlib";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { Chip } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";

import { useUserOrOrgShortnameByWebId } from "../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { generateLinkParameters } from "../../../generate-link-parameters";
import { Link } from "../../../ui";

import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityType } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { SxProps, Theme } from "@mui/material";
import type {
  ComponentPropsWithoutRef,
  FunctionComponent,
  ReactNode,
} from "react";

/**
 * The maximum height of the results dropdown. Below this the list grows to fit
 * its content; above it the virtualized list scrolls.
 */
const resultListMaxHeight = 240; // 15rem

/**
 * The bordered dropdown that floats below the search input. Used both for the
 * virtualized result list and for the loading / empty status messages.
 */
const ResultListContainer: FunctionComponent<{
  isMobile: boolean;
  children?: ReactNode;
}> = ({ isMobile, children }) => (
  <Box
    sx={(theme) => ({
      position: !isMobile ? "absolute" : "unset",
      top: !isMobile ? "calc(100% + 1px)" : "unset",
      zIndex: 10_000,
      width: "100%",
      overflow: "hidden",
      border: `1px solid ${theme.palette.gray[20]}`,
      borderRadius: "0.5rem",
      boxShadow: theme.shadows[1],
    })}
  >
    {children}
  </Box>
);

type SearchResult =
  | { kind: "entityType"; entityType: EntityType }
  | { kind: "entity"; entity: HashEntity };

const VirtuosoList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"ul">>(
  (props, ref) => (
    <Box
      component="ul"
      ref={ref}
      sx={{ margin: 0, padding: 0, listStyle: "none" }}
      {...props}
    />
  ),
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

const chipStyles = { cursor: "pointer !important", ml: 1 };

const EntityResult: FunctionComponent<{
  entity: HashEntity;
  onClick: () => void;
  subgraph: Subgraph<EntityRootType<HashEntity>>;
}> = ({ entity, onClick, subgraph }) => {
  const entityId = entity.metadata.recordId.entityId;

  const webId = extractWebIdFromEntityId(entityId);
  const { shortname: entityOwningShortname } = useUserOrOrgShortnameByWebId({
    webId,
  });

  const entityTypes = useMemo(
    () =>
      entity.metadata.entityTypeIds.map((entityTypeId) => {
        const entityType = getEntityTypeById(subgraph, entityTypeId);

        if (!entityType) {
          throw new Error(`Entity type ${entityTypeId} not found in subgraph`);
        }

        return entityType;
      }),
    [entity.metadata.entityTypeIds, subgraph],
  );

  return (
    <Link
      onClick={onClick}
      noLinkStyle
      href={`/@${entityOwningShortname}/entities/${extractEntityUuidFromEntityId(
        entityId,
      )}`}
    >
      <ResultItem>
        {generateEntityLabel(subgraph, entity)}
        <Stack direction="row" gap={1}>
          {entityTypes.map((entityType) => (
            <Chip
              key={entityType.schema.$id}
              color="teal"
              label={entityType.schema.title}
              sx={chipStyles}
            />
          ))}
        </Stack>
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
      onClick={onClick}
      noLinkStyle
      href={generateLinkParameters(entityType.$id)}
    >
      <ResultItem>
        {entityType.title}
        <Chip color="aqua" label="Entity Type" sx={chipStyles} />
      </ResultItem>
    </Link>
  );
};

type ResultListContext = {
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  loadingMore: boolean;
  onSelect: () => void;
};

const renderSearchResult = (
  _index: number,
  result: SearchResult,
  { entitySubgraph, onSelect }: ResultListContext,
): ReactNode =>
  result.kind === "entityType" ? (
    <EntityTypeResult entityType={result.entityType} onClick={onSelect} />
  ) : (
    <EntityResult
      entity={result.entity}
      subgraph={entitySubgraph}
      onClick={onSelect}
    />
  );

/** Spinner shown beneath the rows while the next page is being fetched. */
const ResultListFooter: FunctionComponent<{ context?: ResultListContext }> = ({
  context,
}) =>
  context?.loadingMore ? (
    <Box
      sx={(theme) => ({
        display: "flex",
        justifyContent: "center",
        padding: 1,
        backgroundColor: theme.palette.gray[10],
      })}
    >
      <CircularProgress size={16} />
    </Box>
  ) : null;

const ResultList: FunctionComponent<{
  isMobile: boolean;
  results: SearchResult[];
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: () => void;
}> = ({
  isMobile,
  results,
  entitySubgraph,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelect,
}) => {
  /**
   * Track the total height of the rendered rows so the list can size itself to
   * its content, capped at {@link resultListMaxHeight}. Initialised to the max
   * height so Virtuoso has a viewport to measure against on first paint.
   */
  const [listHeight, setListHeight] = useState(resultListMaxHeight);

  const context = useMemo<ResultListContext>(
    () => ({ entitySubgraph, loadingMore, onSelect }),
    [entitySubgraph, loadingMore, onSelect],
  );

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <ResultListContainer isMobile={isMobile}>
      <Virtuoso<SearchResult, ResultListContext>
        data={results}
        context={context}
        totalListHeightChanged={setListHeight}
        style={{ height: Math.min(listHeight, resultListMaxHeight) }}
        components={{ Footer: ResultListFooter, List: VirtuosoList }}
        endReached={handleEndReached}
        increaseViewportBy={resultListMaxHeight}
        itemContent={renderSearchResult}
      />
    </ResultListContainer>
  );
};

/**
 * The dropdown of search results shown beneath the search input: the loading
 * and empty states, and the virtualized, infinitely-scrolling result list.
 */
export const SearchResults: FunctionComponent<{
  isMobile: boolean;
  /** Whether the dropdown should be shown. */
  visible: boolean;
  /** The query text currently shown in the input. */
  displayedQuery: string;
  /** The debounced query the current results correspond to. */
  submittedQuery: string;
  /** Whether the first page of results is still loading. */
  loading: boolean;
  entityTypes: EntityType[];
  entities: HashEntity[];
  entitySubgraph?: Subgraph<EntityRootType<HashEntity>>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Called when a result is selected, to close the dropdown. */
  onClose: () => void;
}> = ({
  isMobile,
  visible,
  displayedQuery,
  submittedQuery,
  loading,
  entityTypes,
  entities,
  entitySubgraph,
  hasMore,
  loadingMore,
  onLoadMore,
  onClose,
}) => {
  // Don't show anything until the debounced query has caught up with the input,
  // so results for a stale query aren't flashed.
  if (!visible || !displayedQuery || submittedQuery !== displayedQuery) {
    return null;
  }

  if (loading) {
    return (
      <ResultListContainer isMobile={isMobile}>
        <ResultItem sx={{ display: "block" }}>
          Loading results for&nbsp;<b>{submittedQuery}</b>.
        </ResultItem>
      </ResultListContainer>
    );
  }

  // Entities first, then entity types: entities are paginated first, and
  // entity types only load once the entities are exhausted, so this matches
  // the order in which results are fetched and appended to the list.
  const combinedResults: SearchResult[] = [
    ...entities.map((entity): SearchResult => ({ kind: "entity", entity })),
    ...entityTypes.map(
      (entityType): SearchResult => ({ kind: "entityType", entityType }),
    ),
  ];

  if (!combinedResults.length) {
    return (
      <ResultListContainer isMobile={isMobile}>
        <ResultItem sx={{ display: "block" }}>
          No results found for&nbsp;<b>{submittedQuery}</b>.
        </ResultItem>
      </ResultListContainer>
    );
  }

  return (
    <ResultList
      isMobile={isMobile}
      results={combinedResults}
      entitySubgraph={entitySubgraph!}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      onSelect={onClose}
    />
  );
};
