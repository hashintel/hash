import type { EntityId } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import {
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, Paper, Typography } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import type { DashboardItemData } from "../../shared/types";
import { DashboardItemContent } from "./dashboard-item/dashboard-item-content";

type DashboardItemProps = {
  item: DashboardItemData;
  /** Effective script params (from page state). Passed to content for script execution. */
  scriptParams?: Record<string, string>;
  /** Called when user changes a script parameter (e.g. date range). */
  onScriptParamsChange?: (
    itemId: string,
    params: Record<string, string>,
  ) => void;
  isEditing?: boolean;
  isMinimized?: boolean;
  isDataLoading?: boolean;
  onMinimizeToggle?: () => void;
  onConfigureClick?: () => void;
  onRefreshClick?: () => void;
  onDeleteClick?: () => void;
  onEntityClick?: (entityId: EntityId) => void;
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
};

export const DashboardItem = ({
  item,
  scriptParams,
  onScriptParamsChange,
  isEditing = false,
  isMinimized = false,
  isDataLoading = false,
  onMinimizeToggle,
  onConfigureClick,
  onRefreshClick,
  onDeleteClick,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
}: DashboardItemProps) => {
  const { configurationStatus, title, dataScript, entityId } = item;
  const itemId = item.gridPosition.i || entityId;
  const dateRangeParam = dataScript?.parameters?.dateRange;
  const effectiveScriptParams = scriptParams ?? item.scriptParams ?? {};
  const currentDateRange =
    effectiveScriptParams.dateRange ?? dateRangeParam?.default ?? "";

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
          py: 0.5,
          borderBottom: isMinimized
            ? "none"
            : ({ palette }) => `1px solid ${palette.gray[20]}`,
          height: 36,
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
        {!isMinimized &&
          configurationStatus === "ready" &&
          dateRangeParam &&
          onScriptParamsChange && (
            <Select
              size="small"
              value={currentDateRange}
              onChange={(e) => {
                const value = e.target.value;
                onScriptParamsChange(itemId, {
                  ...effectiveScriptParams,
                  dateRange: value,
                });
              }}
              sx={{
                minWidth: 100,
                height: 28,
                fontSize: 12,
                "& .MuiSelect-select": { py: 0.25 },
              }}
            >
              {dateRangeParam.options.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
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
              <IconButton
                size="small"
                onClick={onMinimizeToggle}
                sx={{
                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.gray[10],
                  },
                }}
              >
                {isMinimized ? (
                  <ExpandMoreIcon fontSize="small" />
                ) : (
                  <ExpandLessIcon fontSize="small" />
                )}
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
      {!isMinimized && (
        <Box sx={{ flex: 1, p: 1, minHeight: 0 }}>
          <DashboardItemContent
            item={item}
            scriptParams={effectiveScriptParams}
            isDataLoading={isDataLoading}
            onConfigureClick={onConfigureClick}
            onEntityClick={onEntityClick}
            hoveredEntityId={hoveredEntityId}
            onHoveredEntityChange={onHoveredEntityChange}
          />
        </Box>
      )}
    </Paper>
  );
};
