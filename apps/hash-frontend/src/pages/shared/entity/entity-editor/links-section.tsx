import { Stack } from "@mui/material";

import { useEntityEditor } from "./entity-editor-context";
import { IncomingLinksSection } from "./links-section/incoming-links-section";
import { OutgoingLinksSection } from "./links-section/outgoing-links-section";

export const LinksSection = ({ isLinkEntity }: { isLinkEntity: boolean }) => {
  const { entity } = useEntityEditor();

  return (
    <Stack gap={6}>
      <OutgoingLinksSection
        isLinkEntity={isLinkEntity}
        key={`outgoing-${entity.metadata.recordId.editionId}`}
      />

      <IncomingLinksSection
        isLinkEntity={isLinkEntity}
        key={`incoming-${entity.metadata.recordId.editionId}`}
      />
    </Stack>
  );
};
