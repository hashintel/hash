import { Chip } from "@hashintel/hash-design-system/chip";
import { LinksIcon } from "../../../../shared/icons";
import { EntitySection } from "./entity-section";
import { EntitySectionEmptyState } from "./entity-section-empty-state";

export const LinksSection = () => {
  return (
    <EntitySection title="Links" titleStartContent={<Chip label="No links" />}>
      <EntitySectionEmptyState
        title="This entity currently has no links"
        titleIcon={<LinksIcon />}
        description="Links contain information about connections or relationships between
        different entities"
      />
    </EntitySection>
  );
};
