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
      overflow: "auto",
      border: `1px solid ${theme.palette.gray[20]}`,
      borderRadius: "0.5rem",
      boxShadow: theme.shadows[1],
      backgroundColor: theme.palette.gray[10],
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

const LoadingMore: FunctionComponent = () => (
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
);

const ResultList: FunctionComponent<{
  results: SearchResult[];
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: () => void;
}> = ({
  results,
  entitySubgraph,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelect,
}) => {
  const [listHeight, setListHeight] = useState(resultListMaxHeight);

  const itemContent = useCallback(
    (_index: number, result: SearchResult) =>
      result.kind === "entityType" ? (
        <EntityTypeResult entityType={result.entityType} onClick={onSelect} />
      ) : (
        <EntityResult
          entity={result.entity}
          subgraph={entitySubgraph}
          onClick={onSelect}
        />
      ),
    [entitySubgraph, onSelect],
  );

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <Virtuoso<SearchResult>
      data={results}
      totalListHeightChanged={setListHeight}
      style={{ height: Math.min(listHeight, resultListMaxHeight) }}
      components={{
        List: VirtuosoList,
        ...(loadingMore ? { Footer: LoadingMore } : {}),
      }}
      endReached={handleEndReached}
      increaseViewportBy={50}
      itemContent={itemContent}
    />
  );
};

export const SearchResults: FunctionComponent<{
  isMobile: boolean;
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
  if (loading) {
    return (
      <ResultListContainer isMobile={isMobile}>
        <ResultItem sx={{ display: "block" }}>
          Loading results for&nbsp;<b>{submittedQuery}</b>
        </ResultItem>
      </ResultListContainer>
    );
  }

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
    <ResultListContainer isMobile={isMobile}>
      <ResultList
        results={combinedResults}
        entitySubgraph={entitySubgraph!}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onSelect={onClose}
      />
    </ResultListContainer>
  );
};
