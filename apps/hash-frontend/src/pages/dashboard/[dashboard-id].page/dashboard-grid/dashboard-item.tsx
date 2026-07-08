import { Box, ButtonBase, CircularProgress, Typography } from "@mui/material";
import { useCallback } from "react";

import { Icon } from "@hashintel/ds-components";

import { useDashboardItemData } from "../../hooks/use-dashboard-item-data";
import { DashboardItemContent } from "./dashboard-item/dashboard-item-content";

import type { DashboardItemData } from "../../shared/types";
import type { EntityId } from "@blockprotocol/type-system";
import type { ReactNode } from "react";

/** CSS class for the element that initiates a card drag while editing */
export const DRAG_HANDLE_CLASS = "dashboard-item-drag-handle";

const cardBorderColor = "#dfdfdf";

/**
 * Small square action button used in the card header (from the Figma card
 * design – 24px, 6px radius, faint neutral or red backgrounds).
 */
const CardActionButton = ({
  children,
  destructive = false,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) => (
  <ButtonBase
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    sx={{
      width: 24,
      height: 24,
      borderRadius: "6px",
      flexShrink: 0,
      color: destructive ? "#e5484d" : "#202020",
      backgroundColor: destructive
        ? "rgba(251, 112, 114, 0.12)"
        : "rgba(0, 0, 0, 0.05)",
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: destructive
          ? "rgba(251, 112, 114, 0.24)"
          : "rgba(0, 0, 0, 0.1)",
      },
      "&.Mui-disabled": {
        opacity: 0.5,
      },
    }}
  >
    {children}
  </ButtonBase>
);

/** Two-column grip glyph shown in the drag handle (no ds-components icon exists for it) */
const GripVerticalIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    {[5, 10, 15].flatMap((y) =>
      [7.5, 12.5].map((x) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="#9b9b9b" />
      )),
    )}
  </svg>
);

type DashboardItemProps = {
  item: DashboardItemData;
  isEditing?: boolean;
  isMinimized?: boolean;
  onMinimizeToggle?: () => void;
  onConfigureClick?: () => void;
  onDeleteClick?: () => void;
  onEntityClick?: (entityId: EntityId) => void;
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
};

export const DashboardItem = ({
  item,
  isEditing = false,
  isMinimized = false,
  onMinimizeToggle,
  onConfigureClick,
  onDeleteClick,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
}: DashboardItemProps) => {
  const { configurationStatus, title, entityId } = item;

  const {
    data: chartData,
    loading: dataLoading,
    error: dataError,
    refresh,
  } = useDashboardItemData({
    itemEntityId: entityId,
    enabled: configurationStatus === "ready",
  });

  const handleRefreshClick = useCallback(() => {
    refresh({ force: true });
  }, [refresh]);

  const handleRetryClick = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <Box
      className="dashboard-item-card"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "white",
        border: `1px solid ${cardBorderColor}`,
        borderRadius: "12px",
      }}
    >
      {/* Header: optional drag handle + title + action buttons. When
          minimized the card is a single (36px) grid row, so the header fills
          it rather than keeping its 44px height and getting clipped. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "stretch",
          height: isMinimized ? "100%" : 44,
          flexShrink: 0,
          borderBottom: isMinimized ? "none" : `1px solid ${cardBorderColor}`,
        }}
      >
        {isEditing && (
          <Box
            className={DRAG_HANDLE_CLASS}
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1,
              backgroundColor: "#fafafa",
              borderRight: `1px solid ${cardBorderColor}`,
            }}
          >
            <GripVerticalIcon />
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pl: isEditing ? 1.25 : 1.5,
            pr: 1.25,
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              minWidth: 0,
            }}
          >
            {title && (
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: "20px",
                  color: "#000",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </Typography>
            )}
            {configurationStatus === "ready" && (
              <ButtonBase
                onClick={handleRefreshClick}
                disabled={dataLoading}
                aria-label="Recompute chart data"
                title="Recompute chart data"
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "4px",
                  color: "#838383",
                  flexShrink: 0,
                  "&:hover": { color: "#202020" },
                }}
              >
                {dataLoading && chartData ? (
                  <CircularProgress size={12} sx={{ color: "inherit" }} />
                ) : (
                  <Icon name="rotate" size="xs" />
                )}
              </ButtonBase>
            )}
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexShrink: 0,
            }}
          >
            {isEditing && (
              <>
                <CardActionButton
                  destructive
                  label="Delete item"
                  onClick={onDeleteClick}
                >
                  <Icon name="trash" size="sm" />
                </CardActionButton>
                <CardActionButton
                  label="Configure chart"
                  onClick={onConfigureClick}
                >
                  <Icon name="sliders" size="sm" />
                </CardActionButton>
              </>
            )}
            <CardActionButton
              label={isMinimized ? "Expand" : "Collapse"}
              onClick={onMinimizeToggle}
            >
              <Icon
                name={isMinimized ? "chevronDown" : "chevronUp"}
                size="sm"
              />
            </CardActionButton>
          </Box>
        </Box>
      </Box>

      {/* Content */}
      {!isMinimized && (
        <Box sx={{ flex: 1, p: 1, minHeight: 0 }}>
          <DashboardItemContent
            item={item}
            chartData={chartData}
            dataLoading={dataLoading}
            dataError={dataError}
            onRetryDataClick={handleRetryClick}
            onConfigureClick={onConfigureClick}
            onEntityClick={onEntityClick}
            hoveredEntityId={hoveredEntityId}
            onHoveredEntityChange={onHoveredEntityChange}
          />
        </Box>
      )}
    </Box>
  );
};
