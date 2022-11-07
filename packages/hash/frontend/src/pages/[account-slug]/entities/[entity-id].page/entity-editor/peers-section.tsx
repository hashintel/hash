import { Chip } from "@hashintel/hash-design-system/chip";
import { ShapesIcon } from "../../../../../shared/icons";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { SectionEmptyState } from "../../../shared/section-empty-state";

export const PeersSection = () => {
  return (
    <SectionWrapper title="Peers" titleStartContent={<Chip label="No peers" />}>
      <SectionEmptyState
        title="This entity currently has no known peers"
        titleIcon={<ShapesIcon />}
        description="Peers are instances of a concept found in other graphs. These are
        common, as different users often want to represent the same entities
        in varying ways (e.g. attaching additional information, or providing
        alternative values for properties)"
      />
    </SectionWrapper>
  );
};
