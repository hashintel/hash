import type { NoisySystemTypeId } from "@local/hash-isomorphic-utils/graph-queries";
import { noisySystemTypeIds } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  getIncomingLinkAndSourceEntities,
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Stack } from "@mui/material";

import { useEntityEditor } from "./entity-editor-context";
import { IncomingLinksSection } from "./links-section/incoming-links-section";
import { OutgoingLinksSection } from "./links-section/outgoing-links-section";

export const LinksSection = ({ isLinkEntity }: { isLinkEntity: boolean }) => {
  const { entitySubgraph } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const outgoingLinks = getOutgoingLinksForEntity(
    entitySubgraph,
    entity.metadata.recordId.entityId,
    entity.metadata.temporalVersioning[
      entitySubgraph.temporalAxes.resolved.variable.axis
    ],
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
      !incomingLinkAndSource.linkEntity[0].metadata.entityTypeIds.some(
        (typeId) => noisySystemTypeIds.includes(typeId as NoisySystemTypeId),
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
