import { Box, Tooltip, Typography } from "@mui/material";
import { ReactNode } from "react";
import { CircleInfoIcon } from "../../../shared/icons";

interface SectionWrapperProps {
  children: ReactNode;
  title: string;
  titleTooltip?: string;
  titleStartContent?: ReactNode;
  titleEndContent?: ReactNode;
}

export const SectionWrapper = ({
  children,
  title,
  titleTooltip,
  titleStartContent,
  titleEndContent,
}: SectionWrapperProps) => {
  return (
    <Box>
      <Box mb={2} display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
        <Typography variant="h5">
          {title}
          {titleTooltip && (
            <Tooltip title={titleTooltip} placement="top">
              <Box display="inline">
                <Box
                  component={CircleInfoIcon}
                  sx={{
                    ml: 1,
                    color: ({ palette }) => palette.gray[50],
                  }}
                />
              </Box>
            </Tooltip>
          )}
        </Typography>

        <Box>{titleStartContent}</Box>
        <Box sx={{ ml: "auto" }}>{titleEndContent}</Box>
      </Box>

      {children}
    </Box>
  );
};
