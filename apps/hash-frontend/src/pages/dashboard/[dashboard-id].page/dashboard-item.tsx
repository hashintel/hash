import { IconButton } from "@hashintel/design-system";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, Paper } from "@mui/material";

import type { DashboardItemData } from "../shared/types";
import { DashboardItemContent } from "./dashboard-item-content";

type DashboardItemProps = {
  item: DashboardItemData;
  isEditing?: boolean;
  onConfigureClick?: () => void;
  onRefreshClick?: () => void;
  onDeleteClick?: () => void;
};

export const DashboardItem = ({
  item,
  isEditing = false,
  onConfigureClick,
  onRefreshClick,
  onDeleteClick,
}: DashboardItemProps) => {
  const { configurationStatus } = item;

  return (
    <Paper
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
      elevation={2}
    >
      {/* Floating action buttons in top right */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 0.5,
          zIndex: 1,
        }}
      >
        {configurationStatus === "ready" && (
          <>
            <IconButton
              size="small"
              onClick={onRefreshClick}
              sx={{
                backgroundColor: ({ palette }) => palette.common.white,
                boxShadow: 1,
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.gray[10],
                },
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={onConfigureClick}
              sx={{
                backgroundColor: ({ palette }) => palette.common.white,
                boxShadow: 1,
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.gray[10],
                },
              }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </>
        )}
        {isEditing && (
          <IconButton
            size="small"
            onClick={onDeleteClick}
            sx={{
              backgroundColor: ({ palette }) => palette.common.white,
              boxShadow: 1,
              color: ({ palette }) => palette.red[70],
              "&:hover": {
                backgroundColor: ({ palette }) => palette.red[10],
                color: ({ palette }) => palette.red[80],
              },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 1, minHeight: 0 }}>
        <DashboardItemContent item={item} onConfigureClick={onConfigureClick} />
      </Box>
    </Paper>
  );
};
