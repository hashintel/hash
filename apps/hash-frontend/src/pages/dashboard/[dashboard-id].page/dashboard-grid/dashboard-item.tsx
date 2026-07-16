import { Box, ButtonBase, CircularProgress, Typography } from "@mui/material";
import { useCallback } from "react";

import { Icon } from "@hashintel/ds-components";

import { useDashboardItemData } from "../../hooks/use-dashboard-item-data";
import { DeleteIconButton } from "../delete-icon-button";
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
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
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
      color: "#202020",
      backgroundColor: "rgba(0, 0, 0, 0.05)",
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.1)",
      },
      "&.Mui-disabled": {
        opacity: 0.5,
      },
    }}
  >
    {children}
  </ButtonBase>
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
  const { chartConfig, chartType, configurationStatus, title, entityId } = item;

  const isRegenerating =
    configurationStatus === "configuring" && !!chartType && !!chartConfig;

  const displayedItem = isRegenerating
    ? { ...item, configurationStatus: "ready" as const }
    : item;

  const {
    data: chartData,
    loading: dataLoading,
    error: dataError,
    refresh,
  } = useDashboardItemData({
    itemEntityId: entityId,
    enabled: configurationStatus === "ready" || isRegenerating,
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
              color: "#9b9b9b",
              backgroundColor: "#fafafa",
              borderRight: `1px solid ${cardBorderColor}`,
            }}
          >
            <Icon name="gripVertical" size="sm" />
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
            {configurationStatus === "configuring" && (
              <CircularProgress
                size={12}
                aria-label={
                  isRegenerating ? "Regenerating item" : "Generating new item"
                }
              />
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
                <DeleteIconButton label="Delete item" onClick={onDeleteClick} />
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
        <Box sx={{ flex: 1, p: 1, minHeight: 0, position: "relative" }}>
          <DashboardItemContent
            item={displayedItem}
            chartData={chartData}
            dataLoading={dataLoading}
            dataError={dataError}
            onRetryDataClick={handleRetryClick}
            onConfigureClick={onConfigureClick}
            onEntityClick={onEntityClick}
            hoveredEntityId={hoveredEntityId}
            onHoveredEntityChange={onHoveredEntityChange}
          />
          {isRegenerating && (
            <Box
              sx={{
                position: "absolute",
                inset: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
                borderRadius: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.78)",
                backdropFilter: "blur(2px)",
              }}
            >
              <CircularProgress size={32} />
              <Typography
                variant="smallTextParagraphs"
                sx={{ color: ({ palette }) => palette.gray[70] }}
              >
                Regenerating item...
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
