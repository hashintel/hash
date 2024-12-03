import { Chip } from "@hashintel/design-system";

import { LinksIcon } from "../../../../../shared/icons";
import { SectionWrapper } from "../../../../shared/section-wrapper";
import { SectionEmptyState } from "../../../shared/section-empty-state";

export const PropertiesSectionEmptyState = () => {
  return (
    <SectionWrapper
      title="Properties"
      titleStartContent={
        <Chip
          label="No properties"
          sx={{ "& span": { fontSize: 13 }, ml: 1 }}
        />
      }
    >
      <SectionEmptyState
        title="This entity currently has no properties"
        titleIcon={<LinksIcon />}
        description="Properties contain data about entities, and are inherited from types"
      />
    </SectionWrapper>
  );
};
