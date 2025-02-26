import { Chip } from "@hashintel/design-system";

import { LinksIcon } from "../../../../shared/icons";
import { SectionEmptyState } from "../../../@/[shortname]/shared/section-empty-state";
import { SectionWrapper } from "../../section-wrapper";

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
