import { Chip } from "@hashintel/hash-design-system/chip";
import { Stack } from "@mui/material";
import { LinksIcon } from "../../../../shared/icons";
import { EntitySection } from "./shared/entity-section";
import { EntitySectionEmptyState } from "./shared/entity-section-empty-state";
import { WhiteChip } from "./shared/white-chip";

const EmptyState = () => (
  <EntitySectionEmptyState
    title="This entity currently has no links"
    titleIcon={<LinksIcon />}
    description="Links contain information about connections or relationships between
different entities"
  />
);

export const LinksSection = () => {
  const isEmpty = false;

  return (
    <EntitySection
      title="Links"
      titleStartContent={
        isEmpty ? (
          <Chip label="No links" />
        ) : (
          <Stack direction="row" spacing={1.5}>
            <Chip size="xs" label="3 links" />
            <WhiteChip size="xs" label="1 linked entity" />
          </Stack>
        )
      }
    >
      {isEmpty ? <EmptyState /> : "Here comes links table"}
    </EntitySection>
  );
};
