import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Typography } from "@mui/material";
import { WhiteCard } from "../../entity-types/white-card";
import { EntitySection } from "./entity-section";

export const TypesSection = () => {
  return (
    <EntitySection title="Types">
      <Box display="flex">
        <WhiteCard>
          <Box
            display="flex"
            alignItems="center"
            px={1.5}
            py={0.75}
            gap={1.25}
            color={({ palette }) => palette.black}
          >
            <FontAwesomeIcon icon={faAsterisk} />
            <Typography variant="smallTextLabels" fontWeight={600}>
              Company
            </Typography>
          </Box>
        </WhiteCard>
      </Box>
    </EntitySection>
  );
};
