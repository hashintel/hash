import { Stack } from "@mui/material";

import {
  getIncomingLinkAndSourceEntities,
  getOutgoingLinksForEntity,
} from "@blockprotocol/graph/stdlib";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useEntityEditor } from "./entity-editor-context";
import { IncomingLinksSection } from "./links-section/incoming-links-section";
import { OutgoingLinksSection } from "./links-section/outgoing-links-section";

export const LinksSection = ({ isLinkEntity }: { isLinkEntity: boolean }) => {
  const { draftLinksToArchive, entity, entitySubgraph } = useEntityEditor();

  const outgoingLinks = getOutgoingLinksForEntity(
    entitySubgraph,
    entity.metadata.recordId.entityId,
    entity.metadata.temporalVersioning[
      entitySubgraph.temporalAxes.resolved.variable.axis
    ],
  ).filter(
    (incomingLink) => !draftLinksToArchive.includes(incomingLink.entityId),
  );

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
      incomingLinkAndSource.leftEntity[0] &&
      !incomingLinkAndSource.leftEntity[0].metadata.entityTypeIds.includes(
        systemEntityTypes.claim.entityTypeId,
      )
    );
  });

  return (
    <Stack gap={6}>
      <OutgoingLinksSection
        isLinkEntity={isLinkEntity}
        key={`outgoing-${entity.metadata.recordId.editionId}`}
        outgoingLinks={outgoingLinks}
      />

      <IncomingLinksSection
        isLinkEntity={isLinkEntity}
        key={`incoming-${entity.metadata.recordId.editionId}`}
        incomingLinksAndSources={incomingLinksAndSources}
      />
    </Stack>
  );
};
