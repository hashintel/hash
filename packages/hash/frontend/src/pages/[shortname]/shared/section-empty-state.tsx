import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";

import { WhiteCard } from "./white-card";

interface SectionEmptyStateProps {
  title: string;
  titleIcon: ReactNode;
  description: string;
}

export const SectionEmptyState = ({
  description,
  title,
  titleIcon,
}: SectionEmptyStateProps) => {
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
