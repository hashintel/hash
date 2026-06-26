import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Box, CircularProgress, Paper, Stack } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "@blockprotocol/graph/stdlib";
import {
  Callout,
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/design-system";

import { Grid } from "../../../../../components/grid/grid";
import { createRenderChipCell } from "../../../chip-cell";
import { SectionWrapper } from "../../../section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";
import { renderSummaryChipCell } from "../shared/summary-chip-cell";
import { renderLinkCell } from "./outgoing-links-section/cells/link-cell";
import { renderLinkedWithCell } from "./outgoing-links-section/cells/linked-with-cell";
import { linkGridColumns } from "./outgoing-links-section/constants";
import { OutgoingLinksTable } from "./outgoing-links-section/readonly-outgoing-links-table";
import { useCreateGetCellContent } from "./outgoing-links-section/use-create-get-cell-content";
import { useRows } from "./outgoing-links-section/use-rows";
import { useEntityLinks } from "./use-entity-links";
import { useLinkTypeFilter } from "./use-link-type-filter";

import type { SortGridRows } from "../../../../../components/grid/grid";
import type { VirtualizedTableSort } from "../../../virtualized-table/header/sort";
import type { EntityEditorProps } from "../../entity-editor";
import type { OutgoingLinksFieldId } from "./outgoing-links-section/readonly-outgoing-links-table";
import type {
  LinkColumn,
  LinkColumnKey,
  LinkRow,
} from "./outgoing-links-section/types";
import type { LinkEntityAndRightEntity } from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityQuerySortingRecord } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

type OutgoingLinksSectionProps = Pick<
  EntityEditorProps,
  | "closedMultiEntityType"
  | "closedMultiEntityTypesDefinitions"
  | "customEntityLinksColumns"
  | "defaultOutgoingLinkFilters"
  | "draftLinksToArchive"
  | "draftLinksToCreate"
  | "entitySubgraph"
  | "hasRootLinkDataBeenResolved"
  | "linkAndDestinationEntitiesClosedMultiEntityTypesMap"
  | "onEntityClick"
  | "onTypeClick"
  | "setDraftLinksToArchive"
  | "setDraftLinksToCreate"
  | "slideContainerRef"
  | "readonly"
> & {
  entity: HashEntity;
  isLinkEntity: boolean;
};

export const OutgoingLinksSection = ({
  closedMultiEntityType,
  closedMultiEntityTypesDefinitions: editorDefinitions,
  customEntityLinksColumns,
  defaultOutgoingLinkFilters,
  draftLinksToArchive,
  draftLinksToCreate,
  entity,
  entitySubgraph: editorSubgraph,
  isLinkEntity,
  hasRootLinkDataBeenResolved,
  linkAndDestinationEntitiesClosedMultiEntityTypesMap: editorTypesMap,
  onEntityClick,
  onTypeClick,
  setDraftLinksToArchive,
  setDraftLinksToCreate,
  readonly,
  slideContainerRef,
}: OutgoingLinksSectionProps) => {
  const [showSearch, setShowSearch] = useState(false);

  const [sort, setSort] = useState<VirtualizedTableSort<OutgoingLinksFieldId>>({
    fieldId: "linkTypes",
    direction: "asc",
  });

  const sortingPaths = useMemo<EntityQuerySortingRecord[] | undefined>(() => {
    if (!readonly || sort.fieldId !== "linkTypes") {
      return undefined;
    }

    return [
      {
        path: ["typeTitle"],
        ordering: sort.direction === "asc" ? "ascending" : "descending",
        nulls: "last",
      },
    ];
  }, [readonly, sort.fieldId, sort.direction]);

  /**
   * When arriving from a clicked graph edge (or anywhere else that supplies
   * `defaultOutgoingLinkFilters`), pre-select the edge's link type so the table
   * opens narrowed to it. Server-side (the readonly path this table uses) this
   * drives a filtered re-fetch via `filterTypeIds`; client-side it would filter
   * the in-memory links, like a manual link-type selection.
   *
   * Only the link type is honoured: the graph query is rooted on the link
   * entities and cannot traverse to the target, so the filter's `linkedTo`
   * (which target the edge points at) cannot be applied server-side.
   *
   * Reduced to an order-independent key first so the seed Set's identity is
   * stable across renders (otherwise it would reconcile the filter every render).
   */
  const defaultLinkTypesKey =
    defaultOutgoingLinkFilters?.linkTypes &&
    typeof defaultOutgoingLinkFilters.linkTypes !== "string"
      ? Array.from(defaultOutgoingLinkFilters.linkTypes).sort().join(",")
      : null;

  const defaultSelectedLinkTypeIds = useMemo<Set<VersionedUrl> | undefined>(
    () =>
      defaultLinkTypesKey
        ? new Set(defaultLinkTypesKey.split(",") as VersionedUrl[])
        : undefined,
    [defaultLinkTypesKey],
  );

  const {
    captureLinkTypeOptions,
    filterDefinitions,
    filterValues,
    setFilterValues,
    filterTypeIds,
  } = useLinkTypeFilter({ defaultSelectedLinkTypeIds });

  /**
   * When the entity is readonly we fetch the link data here (paginated), so it
   * does not need to be part of the main entity query. When editable, the link
   * data is part of the editor subgraph (so adding/removing/saving is
   * unchanged) and is not paginated.
   */
  const {
    initialLoading,
    loadingMore,
    loadMore,
    hasMore,
    count: totalCount,
    error,
    linkEntities,
    subgraph: fetchedSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: fetchedTypesMap,
    closedMultiEntityTypesDefinitions: fetchedDefinitions,
    typeIds,
    typeTitles,
  } = useEntityLinks({
    direction: "outgoing",
    entityId: entity.metadata.recordId.entityId,
    filterTypeIds,
    skip: !readonly,
    sortingPaths,
  });

  useEffect(() => {
    captureLinkTypeOptions(typeIds, typeTitles);
  }, [captureLinkTypeOptions, typeIds, typeTitles]);

  /**
   * The links/targets passed to the readonly table. In the self-fetch path the
   * source/target entities come from the merged multi-page subgraph; in the
   * editor path they come from the editor subgraph. Memoised so the new array
   * identity does not defeat the `memo()`-wrapped table on every parent render.
   */
  const outgoingLinksAndTargets = useMemo<LinkEntityAndRightEntity[]>(() => {
    if (readonly) {
      if (!linkEntities || !fetchedSubgraph) {
        return [];
      }

      return linkEntities
        .map((linkEntity) => {
          let rightEntity: LinkEntityAndRightEntity["rightEntity"];
          try {
            rightEntity =
              getRightEntityForLinkEntity(
                fetchedSubgraph,
                linkEntity.metadata.recordId.entityId,
              ) ?? [];
          } catch {
            // `getRightEntityForLinkEntity` throws if no target revision overlaps
            // the resolved instant of the merged multi-page subgraph
            rightEntity = [];
          }

          return { linkEntity: [linkEntity], rightEntity };
        })
        .filter(
          // Drop links whose source entity is missing, mirroring the guard the editor path applies
          (outgoingLinkAndTarget) => !!outgoingLinkAndTarget.rightEntity[0],
        );
    }

    return getOutgoingLinkAndTargetEntities(
      editorSubgraph,
      entity.metadata.recordId.entityId,
      entity.metadata.temporalVersioning[
        editorSubgraph.temporalAxes.resolved.variable.axis
      ],
    );
  }, [readonly, linkEntities, fetchedSubgraph, editorSubgraph, entity]);

  const rows = useRows({
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions: editorDefinitions,
    draftLinksToArchive,
    draftLinksToCreate,
    entity,
    entitySubgraph: editorSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: editorTypesMap,
    onEntityClick,
    readonly,
    setDraftLinksToArchive,
    setDraftLinksToCreate,
  });
  const createGetCellContent = useCreateGetCellContent({
    readonly,
    onTypeClick,
  });

  const sortRows = useCallback<
    SortGridRows<LinkRow, LinkColumn, LinkColumnKey>
  >((unsortedRows, gridSort) => {
    const { columnKey, direction } = gridSort;

    return unsortedRows.toSorted((a, b) => {
      let firstString = "";
      let secondString = "";

      if (columnKey === "linkTitle") {
        firstString = a.linkTitle;
        secondString = b.linkTitle;
      } else if (columnKey === "linkedWith") {
        firstString = a.linkAndTargetEntities[0]?.rightEntityLabel ?? "";
        secondString = b.linkAndTargetEntities[0]?.rightEntityLabel ?? "";
      } else {
        firstString = a.expectedEntityTypes[0]?.title ?? "";
        secondString = b.expectedEntityTypes[0]?.title ?? "";
      }

      const comparison = firstString.localeCompare(secondString);

      return direction === "asc" ? comparison : -comparison;
    });
  }, []);

  if (readonly && error) {
    return (
      <SectionWrapper title="Outgoing Links">
        <Callout type="error">
          Could not load outgoing links. Please try again later.
        </Callout>
      </SectionWrapper>
    );
  }

  if (
    (!readonly && !hasRootLinkDataBeenResolved) ||
    (readonly &&
      (initialLoading ||
        !linkEntities ||
        !fetchedSubgraph ||
        !fetchedDefinitions))
  ) {
    return (
      <SectionWrapper title="Outgoing Links">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      </SectionWrapper>
    );
  }

  const entitySubgraph = readonly ? fetchedSubgraph! : editorSubgraph;
  const closedMultiEntityTypesMap = readonly
    ? (fetchedTypesMap ?? null)
    : editorTypesMap;
  const closedMultiEntityTypesDefinitions = readonly
    ? fetchedDefinitions!
    : editorDefinitions;

  /**
   * When paginated, the link count comes from the query; otherwise it is the
   * number of outgoing links in the editor subgraph (minus any draft removals).
   */
  const outgoingLinks = readonly
    ? null
    : getOutgoingLinksForEntity(
        entitySubgraph,
        entity.metadata.recordId.entityId,
        entity.metadata.temporalVersioning[
          entitySubgraph.temporalAxes.resolved.variable.axis
        ],
      ).filter(
        (outgoingLink) => !draftLinksToArchive.includes(outgoingLink.entityId),
      );

  const linkCount = readonly
    ? (totalCount ?? linkEntities!.length)
    : outgoingLinks!.length;

  if (linkCount === 0 && isLinkEntity) {
    /**
     * We don't show the links tables for link entities unless they have some links already set,
     * because we don't yet fully support linking to/from links in the UI.
     * If they happen to have ended up with some via a different client / process, we show them.
     */
    return null;
  }

  return (
    <SectionWrapper
      title="Outgoing Links"
      titleTooltip="The links on an entity are determined by its type. To add a new link to this entity, specify an additional type or edit an existing one."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip
            size="xs"
            label={`${linkCount} ${linkCount === 1 ? "link" : "links"}`}
          />
          {!!rows.length && (
            <Stack direction="row" spacing={0.5}>
              <IconButton
                rounded
                onClick={() => setShowSearch(true)}
                sx={{ color: ({ palette }) => palette.gray[60] }}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              </IconButton>
            </Stack>
          )}
        </Stack>
      }
    >
      {!readonly ? (
        rows.length > 0 ? (
          <Paper sx={{ overflow: "hidden" }}>
            <Grid
              columns={linkGridColumns}
              createGetCellContent={createGetCellContent}
              customRenderers={[
                renderLinkCell,
                renderLinkedWithCell,
                renderSummaryChipCell,
                createRenderChipCell(),
              ]}
              dataLoading={false}
              height={rows.length > 10 ? 500 : undefined}
              rows={rows}
              onSearchClose={() => setShowSearch(false)}
              showSearch={showSearch}
              sortableColumns={[
                "linkTitle",
                "linkedWith",
                "expectedEntityTypes",
              ]}
              sortRows={sortRows}
            />
          </Paper>
        ) : (
          <LinksSectionEmptyState direction="Outgoing" />
        )
      ) : linkCount > 0 || filterTypeIds !== undefined ? (
        <OutgoingLinksTable
          closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
          closedMultiEntityTypesMap={closedMultiEntityTypesMap}
          customEntityLinksColumns={customEntityLinksColumns}
          defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
          entitySubgraph={entitySubgraph}
          filterDefinitions={filterDefinitions}
          filterValues={filterValues}
          loadingMore={loadingMore}
          onEndReached={hasMore ? loadMore : undefined}
          onEntityClick={onEntityClick}
          onTypeClick={onTypeClick}
          outgoingLinksAndTargets={outgoingLinksAndTargets}
          setFilterValues={setFilterValues}
          setSort={setSort}
          slideContainerRef={slideContainerRef}
          sort={sort}
        />
      ) : (
        <LinksSectionEmptyState direction="Outgoing" />
      )}
    </SectionWrapper>
  );
};
