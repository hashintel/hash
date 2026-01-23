import { IconButton } from "@hashintel/design-system";
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";

import { ChartRenderer } from "./chart-renderer";
import type { DashboardItemData } from "../shared/types";

type DashboardItemProps = {
  item: DashboardItemData;
  onConfigureClick?: () => void;
  onRefreshClick?: () => void;
};

export const DashboardItem = ({
  item,
  onConfigureClick,
  onRefreshClick,
}: DashboardItemProps) => {
  const {
    title,
    chartType,
    chartData,
    chartConfig,
    configurationStatus,
    errorMessage,
  } = item;

  const renderContent = () => {
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
            <Typography
              variant="smallTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[70] }}
            >
              Click to configure this chart
            </Typography>
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
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.gray[70],
                textAlign: "center",
              }}
            >
              Missing chart configuration
            </Typography>
          );
        }
        return (
          <ChartRenderer
            chartType={chartType}
            chartData={chartData}
            chartConfig={chartConfig}
          />
        );
    }
  };

  return (
    <Paper
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      elevation={2}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 48,
        }}
      >
        <Typography variant="smallTextLabels" noWrap sx={{ flex: 1 }}>
          {title}
        </Typography>
        {configurationStatus === "ready" && (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <IconButton size="small" onClick={onRefreshClick}>
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={onConfigureClick}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 1, minHeight: 0 }}>{renderContent()}</Box>
    </Paper>
  );
};
