import { Box, CircularProgress, Stack } from "@mui/material";
import { useMemo, useState } from "react";

import {
  getIncomingLinkAndSourceEntities,
  getLeftEntityForLinkEntity,
} from "@blockprotocol/graph/stdlib";
import { Callout, Chip } from "@hashintel/design-system";
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
  | "slideContainerRef"
  | "readonly"
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
  readonly,
  slideContainerRef,
}: IncomingLinksSectionProps) => {
  /**
   * The sort state lives here so that, in the readonly case, it can drive the
   * paginated query (sorting is applied server-side). The graph API can only
   * sort the link entities by their own label (it cannot sort by the source
   * entity, and the link type column shows the inverse title which the API
   * cannot sort by), so server-side we default to – and only support – the link
   * entity's label. When editable, the full set of links is present and the
   * table sorts client-side instead (across all columns), still driven by this
   * state.
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
    if (!readonly) {
      return undefined;
    }

    return [
      {
        path: ["label"],
        ordering: sort.direction === "asc" ? "ascending" : "descending",
        nulls: "last",
      },
    ];
  }, [readonly, sort.direction]);

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
    count: totalCount,
    error,
    linkEntities,
    subgraph: fetchedSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: fetchedTypesMap,
    closedMultiEntityTypesDefinitions: fetchedDefinitions,
  } = useEntityLinks({
    direction: "incoming",
    entityId: entity.metadata.recordId.entityId,
    skip: !readonly,
    sortingPaths,
  });

  /**
   * The links/sources passed to the readonly table. In the self-fetch path the
   * source entities come from the merged multi-page subgraph; in the editor path
   * they come from the editor subgraph. Memoised so the new array identity does
   * not defeat the `memo()`-wrapped table on every parent render.
   */
  const incomingLinksAndSources = useMemo<LinkEntityAndLeftEntity[]>(() => {
    if (readonly) {
      if (!linkEntities || !fetchedSubgraph) {
        return [];
      }

      return linkEntities
        .map((linkEntity) => {
          let leftEntity: LinkEntityAndLeftEntity["leftEntity"];
          try {
            leftEntity =
              getLeftEntityForLinkEntity(
                fetchedSubgraph,
                linkEntity.metadata.recordId.entityId,
              ) ?? [];
          } catch {
            /**
             * `getLeftEntityForLinkEntity` throws if no source revision overlaps
             * the resolved instant of the merged multi-page subgraph; treat that
             * as a missing endpoint so the link is filtered out below rather than
             * crashing the table.
             */
            leftEntity = [];
          }

          return { linkEntity: [linkEntity], leftEntity };
        })
        .filter(
          /**
           * Drop links whose source entity is missing, mirroring the guard the
           * editor path applies, so no row with an empty endpoint reaches the
           * table (which would throw when building rows).
           */
          (incomingLinkAndSource) => !!incomingLinkAndSource.leftEntity[0],
        );
    }

    return getIncomingLinkAndSourceEntities(
      editorSubgraph,
      entity.metadata.recordId.entityId,
      entity.metadata.temporalVersioning[
        editorSubgraph.temporalAxes.resolved.variable.axis
      ],
    ).filter((incomingLinkAndSource) => {
      return (
        incomingLinkAndSource.linkEntity[0] &&
        !draftLinksToArchive.includes(
          incomingLinkAndSource.linkEntity[0].entityId,
        ) &&
        !incomingLinkAndSource.linkEntity[0].metadata.entityTypeIds.some(
          (typeId) => noisySystemTypeIds.includes(typeId as NoisySystemTypeId),
        ) &&
        incomingLinkAndSource.leftEntity[0] &&
        !incomingLinkAndSource.leftEntity[0].metadata.entityTypeIds.includes(
          systemEntityTypes.claim.entityTypeId,
        )
      );
    });
  }, [
    readonly,
    linkEntities,
    fetchedSubgraph,
    editorSubgraph,
    entity,
    draftLinksToArchive,
  ]);

  if (readonly && error) {
    /**
     * In the self-fetch path the query errors are surfaced here (the editor
     * path's errors are handled by the parent query). Without this, a failed
     * query would fall through to the empty state, making it look like the
     * entity simply has no links.
     */
    return (
      <SectionWrapper title="Incoming Links">
        <Callout type="error">
          Could not load incoming links. Please try again later.
        </Callout>
      </SectionWrapper>
    );
  }

  if (
    readonly &&
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

  const entitySubgraph = readonly ? fetchedSubgraph! : editorSubgraph;
  const closedMultiEntityTypesMap = readonly
    ? (fetchedTypesMap ?? null)
    : editorTypesMap;
  const closedMultiEntityTypesDefinitions = readonly
    ? fetchedDefinitions!
    : editorDefinitions;

  const linkCount = readonly
    ? (totalCount ?? incomingLinksAndSources.length)
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
          entityLabel={entityLabel}
          entitySubgraph={entitySubgraph}
          incomingLinksAndSources={incomingLinksAndSources}
          loadingMore={readonly ? loadingMore : undefined}
          onEndReached={readonly && hasMore ? loadMore : undefined}
          onEntityClick={onEntityClick}
          onTypeClick={onTypeClick}
          readonly={readonly}
          setSort={setSort}
          slideContainerRef={slideContainerRef}
          sort={sort}
        />
      ) : (
        <LinksSectionEmptyState direction="Incoming" />
      )}
    </SectionWrapper>
  );
};
