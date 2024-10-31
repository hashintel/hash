import { Chip } from "@hashintel/design-system";
import type { LinkEntityAndLeftEntity } from "@local/hash-subgraph";
import { Stack } from "@mui/material";

import { SectionWrapper } from "../../../../shared/section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";
import { IncomingLinksTable } from "./incoming-links-section/incoming-links-table";

interface IncomingLinksSectionProps {
  incomingLinksAndSources: LinkEntityAndLeftEntity[];
  isLinkEntity: boolean;
}

export const IncomingLinksSection = ({
  incomingLinksAndSources,
  isLinkEntity,
}: IncomingLinksSectionProps) => {
  if (incomingLinksAndSources.length === 0) {
    if (isLinkEntity) {
      /**
       * We don't show the links tables for link entities unless they have some links already set,
       * because we don't yet fully support linking to/from links in the UI.
       * If they happen to have ended up with some via a different client / process, we show them.
       */
      return null;
    }
    return <LinksSectionEmptyState direction="Incoming" />;
  }

  return (
    <SectionWrapper
      title="Incoming Links"
      titleTooltip="Links from other entities to this entity. These may only be edited on the source entity."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip size="xs" label={`${incomingLinksAndSources.length} links`} />
        </Stack>
      }
    >
      <IncomingLinksTable incomingLinksAndSources={incomingLinksAndSources} />
    </SectionWrapper>
  );
};
