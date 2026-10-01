import { Box } from "@mui/material";

import type { FunctionComponent, ReactNode } from "react";

/**
 * Fallback height for the header (floating top row + grey bar), used in the
 * available-height calculation until the content position is measured.
 */
export const visualizerHeaderHeight = 94;

type VisualizerHeaderProps = {
  /**
   * Left-aligned result summary floating above the table box on the page
   * background (result count).
   */
  topLeft?: ReactNode;
  /**
   * Right-aligned view-level controls floating above the table box on the page
   * background (export, view toggle).
   */
  topRight: ReactNode;
  /** Left-aligned controls in the grey bar (search, filters / bulk actions). */
  bottomLeft: ReactNode;
  /** Right-aligned controls in the grey bar (sort). */
  bottomRight?: ReactNode;
};

export const VisualizerHeader: FunctionComponent<VisualizerHeaderProps> = ({
  topLeft,
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
          justifyContent: "space-between",
          columnGap: 1.5,
        }}
      >
        {/*
         * Bottom-aligned so the count hugs the grey bar below, rather than
         * floating at the centre of the row height set by the taller
         * controls on the right.
         */}
        <Box sx={{ alignSelf: "flex-end" }}>{topLeft}</Box>
        <Box sx={{ display: "flex", alignItems: "center", columnGap: 1.5 }}>
          {topRight}
        </Box>
      </Box>
      {/*
       * The grey bar forms the top edge of the content box below it: it carries
       * the full border (`tableContentSx` leaves its own top border off) and the
       * rounded top corners.
       *
       * It lays out in block flow (`flow-root` contains the float), not flex,
       * so `bottomRight` can genuinely float right: the first line of controls
       * wraps around it, and controls that overflow onto further lines run
       * full-width beneath it. The float sits first in the DOM so the first
       * line box avoids it.
       */}
      <Box
        sx={{
          display: "flow-root",
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
        {bottomRight ? (
          <Box sx={{ float: "right", ml: 1, my: 0.5 }}>{bottomRight}</Box>
        ) : null}
        {bottomLeft}
      </Box>
    </Box>
  );
};
