import { Box, Tooltip, Typography, useTheme } from "@mui/material";

import {
  LoadingSpinner,
  MagnifyingGlassPlusLightIcon,
} from "@hashintel/design-system";

import { GrayToBlueIconButton } from "../../gray-to-blue-icon-button";

interface FrontierControlsProps {
  readonly frontierCount: number;
  readonly isFetching: boolean;
  readonly fetchedCount: number;
  readonly totalToFetch: number;
  readonly error?: string;
  readonly onFetchCompleteFrontier: () => void;
}

export const FrontierControls = ({
  frontierCount,
  isFetching,
  fetchedCount,
  totalToFetch,
  error,
  onFetchCompleteFrontier,
}: FrontierControlsProps) => {
  const theme = useTheme();

  if (frontierCount === 0 && !isFetching && !error) {
    return null;
  }

  const remainingCount = Math.max(0, totalToFetch - fetchedCount);
  const progress =
    isFetching && totalToFetch > 0
      ? `${remainingCount.toLocaleString()} ${
          remainingCount === 1 ? "frontier" : "frontiers"
        } in flight · ${fetchedCount.toLocaleString()} of ${totalToFetch.toLocaleString()} loaded`
      : undefined;
  const compactInFlightText =
    isFetching && totalToFetch > 0
      ? remainingCount > 0
        ? `Fetching ${remainingCount.toLocaleString()} ${
            remainingCount === 1 ? "frontier" : "frontiers"
          }`
        : "Finishing frontier fetch"
      : undefined;
  const badgeCount = isFetching ? 0 : frontierCount;
  const disabled = frontierCount === 0 || isFetching;
  const tooltipTitle =
    error ??
    progress ??
    (frontierCount > 0
      ? `Fetch ${frontierCount.toLocaleString()} frontier ${
          frontierCount === 1 ? "entity" : "entities"
        }`
      : "The visible frontier is fully fetched.");

  return (
    <Box
      sx={{
        position: "absolute",
        top: 8,
        right: 13,
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        zIndex: 8,
      }}
    >
      {compactInFlightText ? (
        <Box
          sx={({ palette }) => ({
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            height: 26,
            px: 0.85,
            borderRadius: "4px",
            bgcolor: palette.gray[5],
            border: `1px solid ${palette.gray[30]}`,
            pointerEvents: "none",
            color: palette.gray[70],
            whiteSpace: "nowrap",
          })}
        >
          <LoadingSpinner size={12} color={theme.palette.blue[70]} />
          <Typography
            component="span"
            sx={({ palette }) => ({
              fontSize: 13,
              color: palette.gray[70],
              fontWeight: 500,
              lineHeight: 1,
            })}
          >
            {compactInFlightText}
          </Typography>
        </Box>
      ) : null}
      <Tooltip title={tooltipTitle} placement="bottom">
        <Box component="span" sx={{ position: "relative", display: "block" }}>
          <GrayToBlueIconButton
            aria-label="Fetch frontier entities"
            disabled={disabled}
            onClick={onFetchCompleteFrontier}
            sx={{
              color: error ? "red.70" : undefined,
              "&:hover": error
                ? ({ palette }) => ({
                    background: "red.10",
                    border: `1px solid ${palette.red[30]}`,
                    color: "red.80",
                  })
                : undefined,
            }}
          >
            {isFetching ? (
              <LoadingSpinner size={13} color={theme.palette.blue[70]} />
            ) : (
              <MagnifyingGlassPlusLightIcon />
            )}
          </GrayToBlueIconButton>
          {badgeCount > 0 ? (
            <Typography
              component="span"
              sx={({ palette }) => ({
                position: "absolute",
                top: -5,
                right: -5,
                minWidth: 16,
                height: 16,
                px: 0.4,
                borderRadius: 8,
                border: `1px solid ${palette.white}`,
                bgcolor: error ? "red.70" : "blue.70",
                color: palette.white,
                fontSize: 9,
                fontWeight: 700,
                lineHeight: "14px",
                textAlign: "center",
                pointerEvents: "none",
              })}
            >
              {badgeCount > 99 ? "99+" : badgeCount.toLocaleString()}
            </Typography>
          ) : null}
        </Box>
      </Tooltip>
      {error ? (
        <Typography
          variant="microText"
          sx={{
            position: "absolute",
            top: 34,
            right: 0,
            width: 180,
            color: "red.80",
            textAlign: "right",
          }}
        >
          {error}
        </Typography>
      ) : null}
    </Box>
  );
};
