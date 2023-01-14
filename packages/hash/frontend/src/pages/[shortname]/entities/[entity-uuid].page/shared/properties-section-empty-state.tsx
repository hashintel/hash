import { Chip } from "@local/hash-design-system";

import { LinksIcon } from "../../../../../shared/icons";
import { SectionEmptyState } from "../../../shared/section-empty-state";
import { SectionWrapper } from "../../../shared/section-wrapper";

export const PropertiesSectionEmptyState = () => {
  return (
    <SectionWrapper
      title="Properties"
      titleStartContent={<Chip label="No properties" />}
    >
      <SectionEmptyState
        title="This entity currently has no properties"
        titleIcon={<LinksIcon />}
        description="Properties contain data about entities, and are inherited from types"
      />
    </SectionWrapper>
  );
};
