import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Box, CircularProgress, Paper, Stack } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

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
  linkAndDestinationEntitiesClosedMultiEntityTypesMap: editorTypesMap,
  onEntityClick,
  onTypeClick,
  setDraftLinksToArchive,
  setDraftLinksToCreate,
  readonly,
  slideContainerRef,
}: OutgoingLinksSectionProps) => {
  const [showSearch, setShowSearch] = useState(false);

  /**
   * When links are fetched here (paginated), sorting is applied server-side, so
   * the sort state lives here in order to drive the query. The default mirrors
   * what the API can sort the link entities by – only their own label and type
   * title are available (the API cannot sort by the target entity), so we
   * default to the link entity's label.
   */
  const [sort, setSort] = useState<VirtualizedTableSort<OutgoingLinksFieldId>>({
    fieldId: "link",
    direction: "asc",
  });

  /**
   * Translate the table sort into graph-query sorting paths, which apply to the
   * query's root (the link entities). Only `link` (the link entity label) and
   * `linkTypes` (its type title) are sortable server-side.
   */
  const sortingPaths = useMemo<EntityQuerySortingRecord[] | undefined>(() => {
    if (!readonly) {
      return undefined;
    }

    return [
      {
        path: sort.fieldId === "linkTypes" ? ["typeTitle"] : ["label"],
        ordering: sort.direction === "asc" ? "ascending" : "descending",
        nulls: "last",
      },
    ];
  }, [readonly, sort]);

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
    count: fetchedCount,
    error,
    linkEntities,
    subgraph: fetchedSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: fetchedTypesMap,
    closedMultiEntityTypesDefinitions: fetchedDefinitions,
  } = useEntityLinks({
    direction: "outgoing",
    entityId: entity.metadata.recordId.entityId,
    skip: !readonly,
    sortingPaths,
  });

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
            /**
             * `getRightEntityForLinkEntity` throws if no target revision overlaps
             * the resolved instant of the merged multi-page subgraph; treat that
             * as a missing endpoint so the link is filtered out below rather than
             * crashing the table.
             */
            rightEntity = [];
          }

          return { linkEntity: [linkEntity], rightEntity };
        })
        .filter(
          /**
           * Drop links whose target entity is missing, so no row with an empty
           * endpoint reaches the table (which would throw when building rows).
           */
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
    /**
     * In the self-fetch path the query errors are surfaced here (the editor
     * path's errors are handled by the parent query). Without this, a failed
     * query would fall through to the empty state, making it look like the
     * entity simply has no links.
     */
    return (
      <SectionWrapper title="Outgoing Links">
        <Callout type="error">
          Could not load outgoing links. Please try again later.
        </Callout>
      </SectionWrapper>
    );
  }

  if (
    readonly &&
    (initialLoading || !linkEntities || !fetchedSubgraph || !fetchedDefinitions)
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
    ? (fetchedCount ?? linkEntities!.length)
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
      {rows.length && !readonly ? (
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
            sortableColumns={["linkTitle", "linkedWith", "expectedEntityTypes"]}
            sortRows={sortRows}
          />
        </Paper>
      ) : outgoingLinksAndTargets.length ? (
        <OutgoingLinksTable
          closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
          closedMultiEntityTypesMap={closedMultiEntityTypesMap}
          customEntityLinksColumns={customEntityLinksColumns}
          defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
          entitySubgraph={entitySubgraph}
          loadingMore={readonly ? loadingMore : undefined}
          onEndReached={readonly && hasMore ? loadMore : undefined}
          onEntityClick={onEntityClick}
          onTypeClick={onTypeClick}
          outgoingLinksAndTargets={outgoingLinksAndTargets}
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
