import type { EntityId } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, Paper, Typography } from "@mui/material";

import type { DashboardItemData } from "../../shared/types";
import { DashboardItemContent } from "./dashboard-item/dashboard-item-content";

type DashboardItemProps = {
  item: DashboardItemData;
  isEditing?: boolean;
  onConfigureClick?: () => void;
  onRefreshClick?: () => void;
  onDeleteClick?: () => void;
  onEntityClick?: (entityId: EntityId) => void;
};

export const DashboardItem = ({
  item,
  isEditing = false,
  onConfigureClick,
  onRefreshClick,
  onDeleteClick,
  onEntityClick,
}: DashboardItemProps) => {
  const { configurationStatus, title } = item;

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
      {/* Header with title and action buttons */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          minHeight: 40,
        }}
      >
        {title && (
          <Typography
            variant="smallTextLabels"
            sx={{
              fontWeight: 600,
              color: ({ palette }) => palette.gray[80],
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              mr: 1,
            }}
          >
            {title}
          </Typography>
        )}
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {configurationStatus === "ready" && (
            <>
              <IconButton
                size="small"
                onClick={onRefreshClick}
                sx={{
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
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 1, minHeight: 0 }}>
        <DashboardItemContent
          item={item}
          onConfigureClick={onConfigureClick}
          onEntityClick={onEntityClick}
        />
      </Box>
    </Paper>
  );
};
