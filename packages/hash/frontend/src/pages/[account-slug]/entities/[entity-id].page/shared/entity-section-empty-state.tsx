import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";
import { WhiteCard } from "../../../entity-types/white-card";

interface EntitySectionEmptyStateProps {
  title: string;
  titleIcon: ReactNode;
  description: string;
}

export const EntitySectionEmptyState = ({
  description,
  title,
  titleIcon,
}: EntitySectionEmptyStateProps) => {
  return (
    <WhiteCard>
      <Box
        p={4.75}
        gap={0.75}
        display="flex"
        flexDirection="column"
        alignItems="center"
        textAlign="center"
      >
        <Typography
          display="flex"
          alignItems="center"
          variant="largeTextLabels"
          fontWeight={600}
          gap={1}
        >
          {titleIcon}
          {title}
        </Typography>
        <Typography color={({ palette }) => palette.gray[60]}>
          {description}
        </Typography>
      </Box>
    </WhiteCard>
  );
};
