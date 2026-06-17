import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Box, CircularProgress, Paper, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "@blockprotocol/graph/stdlib";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";

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
import type { EntityEditorProps } from "../../entity-editor";
import type {
  LinkColumn,
  LinkColumnKey,
  LinkRow,
} from "./outgoing-links-section/types";
import type { LinkEntityAndRightEntity } from "@blockprotocol/graph";
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
  | "readonly"
  | "selfFetchLinks"
  | "setDraftLinksToArchive"
  | "setDraftLinksToCreate"
  | "slideContainerRef"
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
  readonly,
  selfFetchLinks,
  setDraftLinksToArchive,
  setDraftLinksToCreate,
  slideContainerRef,
}: OutgoingLinksSectionProps) => {
  const [showSearch, setShowSearch] = useState(false);

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
    linkEntities,
    subgraph: fetchedSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: fetchedTypesMap,
    closedMultiEntityTypesDefinitions: fetchedDefinitions,
  } = useEntityLinks({
    direction: "outgoing",
    entityId: entity.metadata.recordId.entityId,
    skip: !selfFetchLinks,
  });

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
  >((unsortedRows, sort) => {
    const { columnKey, direction } = sort;

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

  if (
    selfFetchLinks &&
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

  const entitySubgraph = selfFetchLinks ? fetchedSubgraph! : editorSubgraph;
  const closedMultiEntityTypesMap = selfFetchLinks
    ? (fetchedTypesMap ?? null)
    : editorTypesMap;
  const closedMultiEntityTypesDefinitions = selfFetchLinks
    ? fetchedDefinitions!
    : editorDefinitions;

  /**
   * When paginated, the link count comes from the query; otherwise it is the
   * number of outgoing links in the editor subgraph (minus any draft removals).
   */
  const outgoingLinks = selfFetchLinks
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

  const linkCount = selfFetchLinks
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

  let outgoingLinksAndTargets: LinkEntityAndRightEntity[] | null = null;
  if (readonly) {
    outgoingLinksAndTargets = selfFetchLinks
      ? linkEntities!.map((linkEntity) => ({
          linkEntity: [linkEntity],
          rightEntity:
            getRightEntityForLinkEntity(
              entitySubgraph,
              linkEntity.metadata.recordId.entityId,
            ) ?? [],
        }))
      : getOutgoingLinkAndTargetEntities(
          entitySubgraph,
          entity.metadata.recordId.entityId,
          entity.metadata.temporalVersioning[
            entitySubgraph.temporalAxes.resolved.variable.axis
          ],
        );
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
      ) : outgoingLinksAndTargets?.length ? (
        <OutgoingLinksTable
          closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
          closedMultiEntityTypesMap={closedMultiEntityTypesMap}
          customEntityLinksColumns={customEntityLinksColumns}
          defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
          entitySubgraph={entitySubgraph}
          loadingMore={selfFetchLinks ? loadingMore : undefined}
          onEndReached={selfFetchLinks && hasMore ? loadMore : undefined}
          onEntityClick={onEntityClick}
          onTypeClick={onTypeClick}
          outgoingLinksAndTargets={outgoingLinksAndTargets}
          slideContainerRef={slideContainerRef}
        />
      ) : (
        <LinksSectionEmptyState direction="Outgoing" />
      )}
    </SectionWrapper>
  );
};
