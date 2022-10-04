import { Box, Typography } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

interface EntitySectionProps {
  children: ReactNode;
  title: string;
  titleStartContent?: ReactNode;
  titleEndContent?: ReactNode;
}

export const EntitySection: FunctionComponent<EntitySectionProps> = ({
  children,
  title,
  titleStartContent,
  titleEndContent,
}) => {
  return (
    <Box>
      <Box mb={2} display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
        <Typography variant="h5">{title}</Typography>
        <Box>{titleStartContent}</Box>
        <Box sx={{ ml: "auto" }}>{titleEndContent}</Box>
      </Box>

      {children}
    </Box>
  );
};
