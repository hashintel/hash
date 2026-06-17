import { Box, CircularProgress, Stack } from "@mui/material";

import { getIncomingLinkAndSourceEntities } from "@blockprotocol/graph/stdlib";
import { Chip } from "@hashintel/design-system";
import { noisySystemTypeIds } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { SectionWrapper } from "../../../section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";
import { useEntityEditor } from "../entity-editor-context";
import { IncomingLinksTable } from "./incoming-links-section/incoming-links-table";
import { useEntityLinks } from "./use-entity-links";

import type { NoisySystemTypeId } from "@local/hash-isomorphic-utils/graph-queries";

export const IncomingLinksSection = ({
  isLinkEntity,
}: {
  isLinkEntity: boolean;
}) => {
  const {
    closedMultiEntityTypesDefinitions: editorDefinitions,
    draftLinksToArchive,
    entity,
    entitySubgraph: editorSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: editorTypesMap,
    selfFetchLinks,
  } = useEntityEditor();

  /**
   * When the entity is readonly we fetch the link data here, so that it does not
   * need to be part of the main entity query. When editable, the link data is
   * part of the editor subgraph.
   */
  const {
    loading,
    linksSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: fetchedTypesMap,
    closedMultiEntityTypesDefinitions: fetchedDefinitions,
  } = useEntityLinks({
    direction: "incoming",
    entityId: entity.metadata.recordId.entityId,
    skip: !selfFetchLinks,
  });

  if (selfFetchLinks && (loading || !linksSubgraph || !fetchedDefinitions)) {
    return (
      <SectionWrapper title="Incoming Links">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      </SectionWrapper>
    );
  }

  const entitySubgraph = selfFetchLinks ? linksSubgraph! : editorSubgraph;
  const closedMultiEntityTypesMap = selfFetchLinks
    ? (fetchedTypesMap ?? null)
    : editorTypesMap;
  const closedMultiEntityTypesDefinitions = selfFetchLinks
    ? fetchedDefinitions!
    : editorDefinitions;

  const incomingLinksAndSources = getIncomingLinkAndSourceEntities(
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
        (typeId) => noisySystemTypeIds.includes(typeId as NoisySystemTypeId),
      ) &&
      incomingLinkAndSource.leftEntity[0] &&
      !incomingLinkAndSource.leftEntity[0].metadata.entityTypeIds.includes(
        systemEntityTypes.claim.entityTypeId,
      )
    );
  });

  if (incomingLinksAndSources.length === 0 && isLinkEntity) {
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
            label={`${incomingLinksAndSources.length} ${
              incomingLinksAndSources.length === 1 ? "link" : "links"
            }`}
          />
        </Stack>
      }
    >
      {incomingLinksAndSources.length ? (
        <IncomingLinksTable
          closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
          closedMultiEntityTypesMap={closedMultiEntityTypesMap}
          entitySubgraph={entitySubgraph}
          incomingLinksAndSources={incomingLinksAndSources}
        />
      ) : (
        <LinksSectionEmptyState direction="Incoming" />
      )}
    </SectionWrapper>
  );
};
