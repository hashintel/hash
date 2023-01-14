import { Chip } from "@local/hash-design-system";

import { LinksIcon } from "../../../../../shared/icons";
import { SectionEmptyState } from "../../../shared/section-empty-state";
import { SectionWrapper } from "../../../shared/section-wrapper";

export const LinksSectionEmptyState = () => {
  return (
    <SectionWrapper title="Links" titleStartContent={<Chip label="No links" />}>
      <SectionEmptyState
        title="This entity currently has no links"
        titleIcon={<LinksIcon />}
        description="Links contain information about connections or relationships between different entities"
      />
    </SectionWrapper>
  );
};
