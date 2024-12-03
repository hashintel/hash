import { LinksIcon } from "../../../../../shared/icons";
import { SectionEmptyState } from "../../../shared/section-empty-state";

export const LinksSectionEmptyState = ({
  direction,
}: {
  direction: "Incoming" | "Outgoing";
}) => {
  return (
    <SectionEmptyState
      title={`This entity currently has no ${direction.toLowerCase()} links`}
      titleIcon={<LinksIcon />}
      description="Links contain information about connections or relationships between different entities"
    />
  );
};
