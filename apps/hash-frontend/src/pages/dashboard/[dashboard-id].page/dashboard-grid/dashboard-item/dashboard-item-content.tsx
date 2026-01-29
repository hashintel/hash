import { IconButton } from "@hashintel/design-system";
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, CircularProgress, Typography } from "@mui/material";

import type { DashboardItemData } from "../../../shared/types";
import { ChartRenderer } from "./dashboard-item-content/chart-renderer";

type DashboardItemContentProps = {
  item: DashboardItemData;
  onConfigureClick?: () => void;
};

export const DashboardItemContent = ({
  item,
  onConfigureClick,
}: DashboardItemContentProps) => {
  const {
    chartType,
    chartData,
    chartConfig,
    configurationStatus,
    errorMessage,
  } = item;

  switch (configurationStatus) {
    case "pending":
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 2,
          }}
        >
          <IconButton onClick={onConfigureClick} size="large">
            <SettingsIcon />
          </IconButton>
        </Box>
      );

    case "configuring":
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[70] }}
          >
            AI is configuring your chart...
          </Typography>
        </Box>
      );

    case "error":
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 2,
            p: 2,
          }}
        >
          <Typography
            variant="smallTextParagraphs"
            sx={{
              color: ({ palette }) => palette.red[70],
              textAlign: "center",
            }}
          >
            {errorMessage ?? "Failed to configure chart"}
          </Typography>
          <IconButton onClick={onConfigureClick}>
            <RefreshIcon />
          </IconButton>
        </Box>
      );

    case "ready":
      if (!chartType || !chartData || !chartConfig) {
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.gray[70],
                textAlign: "center",
              }}
            >
              Missing chart configuration
            </Typography>
          </Box>
        );
      }
      return (
        <ChartRenderer
          chartType={chartType}
          chartData={chartData}
          chartConfig={chartConfig}
        />
      );

    default:
      return null;
  }
};
