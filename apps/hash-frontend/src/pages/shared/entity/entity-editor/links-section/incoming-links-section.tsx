import { Box, CircularProgress, Stack } from "@mui/material";
import { useMemo, useState } from "react";

import {
  getIncomingLinkAndSourceEntities,
  getLeftEntityForLinkEntity,
} from "@blockprotocol/graph/stdlib";
import { Chip } from "@hashintel/design-system";
import { noisySystemTypeIds } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { SectionWrapper } from "../../../section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";
import { IncomingLinksTable } from "./incoming-links-section/incoming-links-table";
import { useEntityLinks } from "./use-entity-links";

import type { VirtualizedTableSort } from "../../../virtualized-table/header/sort";
import type { EntityEditorProps } from "../../entity-editor";
import type { IncomingLinksFieldId } from "./incoming-links-section/incoming-links-table";
import type { LinkEntityAndLeftEntity } from "@blockprotocol/graph";
import type { EntityQuerySortingRecord } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { NoisySystemTypeId } from "@local/hash-isomorphic-utils/graph-queries";

type IncomingLinksSectionProps = Pick<
  EntityEditorProps,
  | "closedMultiEntityTypesDefinitions"
  | "customEntityLinksColumns"
  | "draftLinksToArchive"
  | "entityLabel"
  | "entitySubgraph"
  | "linkAndDestinationEntitiesClosedMultiEntityTypesMap"
  | "onEntityClick"
  | "onTypeClick"
  | "selfFetchLinks"
  | "slideContainerRef"
> & {
  entity: HashEntity;
  isLinkEntity: boolean;
};

export const IncomingLinksSection = ({
  closedMultiEntityTypesDefinitions: editorDefinitions,
  customEntityLinksColumns,
  draftLinksToArchive,
  entity,
  entityLabel,
  entitySubgraph: editorSubgraph,
  isLinkEntity,
  linkAndDestinationEntitiesClosedMultiEntityTypesMap: editorTypesMap,
  onEntityClick,
  onTypeClick,
  selfFetchLinks,
  slideContainerRef,
}: IncomingLinksSectionProps) => {
  /**
   * When links are fetched here (paginated), sorting is applied server-side, so
   * the sort state lives here in order to drive the query. The graph API can
   * only sort the link entities by their own label (the API cannot sort by the
   * source entity, and the link type column shows the inverse title which the
   * API cannot sort by), so we default to – and only support – the link
   * entity's label.
   */
  const [sort, setSort] = useState<VirtualizedTableSort<IncomingLinksFieldId>>({
    fieldId: "link",
    direction: "asc",
  });

  /**
   * Translate the table sort into graph-query sorting paths, which apply to the
   * query's root (the link entities). Only `link` (the link entity label) is
   * sortable server-side.
   */
  const sortingPaths = useMemo<EntityQuerySortingRecord[] | undefined>(() => {
    if (!selfFetchLinks) {
      return undefined;
    }

    return [
      {
        path: ["label"],
        ordering: sort.direction === "asc" ? "ascending" : "descending",
        nulls: "last",
      },
    ];
  }, [selfFetchLinks, sort.direction]);

  /**
   * When the entity is readonly we fetch the link data here (paginated), so it
   * does not need to be part of the main entity query. When editable, the link
   * data is part of the editor subgraph and is not paginated. The noisy-type /
   * claim exclusions below are applied server-side in the paginated case (so the
   * count is accurate), and client-side for the editor subgraph.
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
    direction: "incoming",
    entityId: entity.metadata.recordId.entityId,
    skip: !selfFetchLinks,
    sortingPaths,
  });

  if (
    selfFetchLinks &&
    (initialLoading || !linkEntities || !fetchedSubgraph || !fetchedDefinitions)
  ) {
    return (
      <SectionWrapper title="Incoming Links">
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

  const incomingLinksAndSources: LinkEntityAndLeftEntity[] = selfFetchLinks
    ? linkEntities!.map((linkEntity) => ({
        linkEntity: [linkEntity],
        leftEntity:
          getLeftEntityForLinkEntity(
            entitySubgraph,
            linkEntity.metadata.recordId.entityId,
          ) ?? [],
      }))
    : getIncomingLinkAndSourceEntities(
        entitySubgraph,
        entity.metadata.recordId.entityId,
        entity.metadata.temporalVersioning[
          entitySubgraph.temporalAxes.resolved.variable.axis
        ],
      ).filter((incomingLinkAndSource) => {
        return (
          incomingLinkAndSource.linkEntity[0] &&
          !draftLinksToArchive.includes(
            incomingLinkAndSource.linkEntity[0].entityId,
          ) &&
          !incomingLinkAndSource.linkEntity[0].metadata.entityTypeIds.some(
            (typeId) =>
              noisySystemTypeIds.includes(typeId as NoisySystemTypeId),
          ) &&
          incomingLinkAndSource.leftEntity[0] &&
          !incomingLinkAndSource.leftEntity[0].metadata.entityTypeIds.includes(
            systemEntityTypes.claim.entityTypeId,
          )
        );
      });

  const linkCount = selfFetchLinks
    ? (fetchedCount ?? incomingLinksAndSources.length)
    : incomingLinksAndSources.length;

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
      title="Incoming Links"
      titleTooltip="Links from other entities to this entity. These may only be edited on the source entity."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip
            size="xs"
            label={`${linkCount} ${linkCount === 1 ? "link" : "links"}`}
          />
        </Stack>
      }
    >
      {incomingLinksAndSources.length ? (
        <IncomingLinksTable
          closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
          closedMultiEntityTypesMap={closedMultiEntityTypesMap}
          customEntityLinksColumns={customEntityLinksColumns}
          draftLinksToArchive={draftLinksToArchive}
          entityLabel={entityLabel}
          entitySubgraph={entitySubgraph}
          incomingLinksAndSources={incomingLinksAndSources}
          loadingMore={selfFetchLinks ? loadingMore : undefined}
          onEndReached={selfFetchLinks && hasMore ? loadMore : undefined}
          onEntityClick={onEntityClick}
          onTypeClick={onTypeClick}
          serverSideSorting={selfFetchLinks}
          setSort={selfFetchLinks ? setSort : undefined}
          slideContainerRef={slideContainerRef}
          sort={selfFetchLinks ? sort : undefined}
        />
      ) : (
        <LinksSectionEmptyState direction="Incoming" />
      )}
    </SectionWrapper>
  );
};
