import {
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Stack } from "@mui/material";

import { useEntityEditor } from "./entity-editor-context";
import { OutgoingLinksSection } from "./links-section/outgoing-links-section";
import { IncomingLinksSection } from "./links-section/incoming-links-section";

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

  const incomingLinks = getIncomingLinksForEntity(
    entitySubgraph,
    entity.metadata.recordId.entityId,
    entity.metadata.temporalVersioning[
      entitySubgraph.temporalAxes.resolved.variable.axis
    ],
  );

  return (
    <Stack>
      <OutgoingLinksSection
        isLinkEntity={isLinkEntity}
        key={entity.metadata.recordId.editionId}
        outgoingLinks={outgoingLinks}
      />

      <IncomingLinksSection
        isLinkEntity={isLinkEntity}
        key={entity.metadata.recordId.editionId}
        incomingLinks={incomingLinks}
      />
    </Stack>
  );
};
