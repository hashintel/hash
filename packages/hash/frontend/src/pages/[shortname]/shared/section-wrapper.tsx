import { Box, Tooltip, Typography } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { CircleInfoIcon } from "../../../shared/icons/circle-info-icon";

interface SectionWrapperProps {
  children: ReactNode;
  title: string;
  titleTooltip?: string;
  titleStartContent?: ReactNode;
  titleEndContent?: ReactNode;
  tooltipIcon?: ReactNode;
}

export const SectionWrapper: FunctionComponent<SectionWrapperProps> = ({
  children,
  title,
  titleTooltip,
  titleStartContent,
  titleEndContent,
  tooltipIcon,
}) => (
  <Box>
    <Box mb={2} display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
      <Box display="flex" alignItems="center">
        <Typography variant="h5">{title}</Typography>

        {titleTooltip && (
          <Tooltip title={titleTooltip} placement="top">
            <Box
              sx={{
                display: "flex",
                ml: 1,
                mr: 1.5,
                color: ({ palette }) => palette.gray[50],
                fontSize: 14,
              }}
            >
              {tooltipIcon ?? <CircleInfoIcon fontSize="inherit" />}
            </Box>
          </Tooltip>
        )}
      </Box>

      <Box>{titleStartContent}</Box>
      <Box sx={{ ml: "auto" }}>{titleEndContent}</Box>
    </Box>

    {children}
  </Box>
);
