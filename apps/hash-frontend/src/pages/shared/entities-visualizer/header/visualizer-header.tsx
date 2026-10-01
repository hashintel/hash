import { Box } from "@mui/material";

import type { FunctionComponent, ReactNode } from "react";

/**
 * Fallback height for the header (floating top row + grey bar), used in the
 * available-height calculation until the content position is measured.
 */
export const visualizerHeaderHeight = 94;

type VisualizerHeaderProps = {
  /**
   * Right-aligned view-level controls floating above the table box on the page
   * background (export, result count, view toggle).
   */
  topRight: ReactNode;
  /** Left-aligned controls in the grey bar (search, filters / bulk actions). */
  bottomLeft: ReactNode;
  /** Right-aligned controls in the grey bar (sort). */
  bottomRight?: ReactNode;
};

export const VisualizerHeader: FunctionComponent<VisualizerHeaderProps> = ({
  topRight,
  bottomLeft,
  bottomRight,
}) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          columnGap: 1.5,
        }}
      >
        {topRight}
      </Box>
      {/*
       * The grey bar forms the top edge of the content box below it: it carries
       * the full border (`tableContentSx` leaves its own top border off) and the
       * rounded top corners.
       */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1.5,
          background: ({ palette }) => palette.gray[20],
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: ({ palette }) => palette.gray[30],
          px: 1.5,
          py: 1,
          borderTopLeftRadius: "6px",
          borderTopRightRadius: "6px",
          minHeight: 52,
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            flex: 1,
            minWidth: 0,
          }}
        >
          {bottomLeft}
        </Box>
        {bottomRight ? (
          <Box sx={{ display: "flex", alignItems: "center", columnGap: 1.5 }}>
            {bottomRight}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};
