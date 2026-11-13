/**
 * HASH's PDF viewer, imported from apps/hash-frontend/src/pages/shared/pdf-preview.tsx (not redrawn), in HASH's MUI
 * theme. Around it, the two controls HASH's File Preview section puts beside its title for a PDF (entity-editor/
 * file-preview-section.tsx): Show thumbnails and Show search. Full screen is the viewer's own button.
 *
 * The one change is the stage behind the page: `background="flows"` (the default) is the Flows grey (neutral step 20)
 * (#F9F9F9), in place of HASH's hard-coded blue[10] (ledger fh2, 10 Nov; Dei on Slack, 6 Nov). `background="hash"`
 * keeps HASH's blue.
 */
import { Box, Stack, ThemeProvider } from "@mui/material";
import { type ReactNode, useState } from "react";

import {
  MagnifyingGlassRegularIcon,
  SidebarRegularIcon,
} from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import { GrayToBlueIconButton } from "@hash-frontend-shared/gray-to-blue-icon-button";
import { PdfPreview } from "@hash-frontend-shared/pdf-preview";
import {
  a4Ratio,
  thumbnailWidth,
  thumbnailXPadding,
} from "@hash-frontend-shared/pdf-preview/dimensions";

export type PdfViewerBackground = "flows" | "hash";

/** Flows grey (neutral step 20), written out: the viewer sits in MUI, outside Panda's tokens. */
const flowsGrey = "#F9F9F9";

export const HashPdfViewer = ({
  url,
  background = "flows",
  header,
  maxHeight,
}: {
  url: string;
  background?: PdfViewerBackground;
  /** Puts the Show thumbnails and Show search controls in the caller's header instead of a row above the viewer. */
  header?: (controls: ReactNode) => ReactNode;
  /**
   * The tallest the viewer may be. HASH sizes the page from its width (capped at the viewport less 120 px), so the
   * width is capped to give an A4 page this height, plus the thumbnail column when it shows.
   */
  maxHeight?: number;
}) => {
  /** HASH's File Preview section state, with its defaults: thumbnails shown, search hidden. */
  const [showSearch, setShowSearch] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const maxWidth =
    maxHeight === undefined
      ? undefined
      : Math.floor(maxHeight / a4Ratio) +
        (showThumbnails ? thumbnailWidth + thumbnailXPadding * 2 : 0);
  const controls = (
    <Stack direction="row" gap={1}>
      <GrayToBlueIconButton
        aria-label={showThumbnails ? "Hide thumbnails" : "Show thumbnails"}
        onClick={() => setShowThumbnails(!showThumbnails)}
      >
        <SidebarRegularIcon
          sx={{
            color: ({ palette }) =>
              showThumbnails ? palette.blue[70] : undefined,
          }}
        />
      </GrayToBlueIconButton>
      <GrayToBlueIconButton
        aria-label={showSearch ? "Hide search" : "Show search"}
        onClick={() => setShowSearch(!showSearch)}
      >
        <MagnifyingGlassRegularIcon
          sx={{
            color: ({ palette }) =>
              showSearch ? palette.blue[70] : undefined,
          }}
        />
      </GrayToBlueIconButton>
    </Stack>
  );
  return (
    <ThemeProvider theme={theme}>
      <Stack gap={1.5} data-hash-pdf-viewer={url} data-background={background}>
        {header ? header(controls) : controls}
        {/* HASH's preview box (file-preview-section.tsx): positions the viewer's search and zoom controls. */}
        <Stack
          sx={({ boxShadows }) => ({
            alignItems: "center",
            justifyContent: "center",
            boxShadow: boxShadows.sm,
            borderRadius: 1,
            height: "auto",
            position: "relative",
            ...(maxWidth === undefined
              ? {}
              : { width: "100%", maxWidth, marginX: "auto" }),
            // HASH's globals.scss rules for the viewer's class names.
            "& .full-height-and-width-for-react-full-screen": {
              width: "100%",
              height: "100%",
            },
            "& .react-pdf-page": {
              border: "1px solid rgba(0, 0, 0, 0.05)",
              height: "100%",
            },
            "& .react-pdf-document": { width: "100%", height: "100%" },
            // The stage: PdfPreview's outer Stack, which HASH paints blue[10].
            ...(background === "flows"
              ? {
                  "& .full-height-and-width-for-react-full-screen > .MuiStack-root":
                    { background: flowsGrey },
                }
              : {}),
          })}
        >
          <Box sx={{ width: "100%" }}>
            <PdfPreview
              key={url}
              setShowSearch={setShowSearch}
              showSearch={showSearch}
              showThumbnails={showThumbnails}
              url={url}
            />
          </Box>
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};
