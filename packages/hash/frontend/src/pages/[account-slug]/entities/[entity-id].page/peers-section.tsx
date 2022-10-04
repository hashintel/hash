import { Chip } from "@hashintel/hash-design-system/chip";
import { ShapesIcon } from "../../../../shared/icons";
import { EntitySection } from "./entity-section";
import { EntitySectionEmptyState } from "./entity-section-empty-state";

export const PeersSection = () => {
  return (
    <EntitySection title="Peers" titleStartContent={<Chip label="No peers" />}>
      <EntitySectionEmptyState
        title="This entity currently has no known peers"
        titleIcon={<ShapesIcon />}
        description="Peers are instances of a concept found in other graphs. These are
        common, as different users often want to represent the same entities
        in varying ways (e.g. attaching additional information, or providing
        alternative values for properties)"
      />
    </EntitySection>
  );
};
