import { Chip } from "@hashintel/hash-design-system/chip";
import { Typography } from "@mui/material";
import { LinksIcon } from "../../../../../shared/icons";
import { WhiteCard } from "../../../entity-types/white-card";
import { EntitySection } from "../shared/entity-section";

export const LinksSection = () => {
  return (
    <EntitySection title="Links" titleStartContent={<Chip label="No links" />}>
      <WhiteCard>
        <Typography>
          <LinksIcon /> This entity currently has no links
        </Typography>
        <Typography>
          Links contain information about connections or relationships between
          different entities
        </Typography>
      </WhiteCard>
    </EntitySection>
  );
};
