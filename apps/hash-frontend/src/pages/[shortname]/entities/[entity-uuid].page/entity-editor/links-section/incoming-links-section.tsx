import { Chip } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import { Paper, Stack } from "@mui/material";

import { SectionWrapper } from "../../../../shared/section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";

interface IncomingLinksSectionProps {
  incomingLinks: Entity<EntityProperties>[];
  isLinkEntity: boolean;
}

export const IncomingLinksSection = ({
  incomingLinks,
  isLinkEntity,
}: IncomingLinksSectionProps) => {
  if (incomingLinks.length === 0) {
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
          <Chip size="xs" label={`${incomingLinks.length} links`} />
        </Stack>
      }
    >
      <Paper sx={{ overflow: "hidden" }}></Paper>
    </SectionWrapper>
  );
};
