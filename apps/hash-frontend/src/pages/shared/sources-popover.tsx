import type { SourceProvenance } from "@local/hash-graph-client/api";
import { Box, Popover, Stack, Typography } from "@mui/material";
import type { RefObject } from "react";

import { Link } from "../../shared/ui/link";

export const SourcesList = ({ sources }: { sources: SourceProvenance[] }) => {
  return (
    <Box
      p={1.5}
      pt={2}
      sx={{
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: 2,
      }}
    >
      <Typography
        component="div"
        sx={{
          color: ({ palette }) => palette.gray[70],
          mb: 1.2,
          lineHeight: 1,
        }}
        variant="smallCaps"
      >
        Sources
      </Typography>
      <Stack gap={2}>
        {sources.map((source, index) => {
          const sourceUrl = source.location?.uri;

          return (
            <Box
              key={source.location?.uri ?? index}
              sx={({ palette }) => ({
                border: `1px solid ${palette.gray[30]}`,
                background: palette.gray[15],
                borderRadius: 2,
                p: 1.5,
              })}
            >
              {source.type !== "integration" && sourceUrl ? (
                <Link
                  href={sourceUrl}
                  target="_blank"
                  sx={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    textDecoration: "none",
                  }}
                >
                  {source.location?.name ?? sourceUrl}
                </Link>
              ) : (
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {source.location?.name ?? "[Unknown title]"}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export const SourcesPopover = ({
  buttonId,
  cellRef,
  open,
  onClose,
  sources,
}: {
  buttonId: string;
  cellRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  sources: SourceProvenance[];
}) => {
  return (
    <Popover
      id={buttonId}
      open={open}
      anchorEl={cellRef.current}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            width: cellRef.current?.scrollWidth,
            minWidth: 400,
            maxWidth: 600,
          },
        },
        root: {
          sx: {
            background: "rgba(0,0,0,0.3)",
          },
        },
      }}
      transitionDuration={50}
    >
      <SourcesList sources={sources} />
    </Popover>
  );
};
