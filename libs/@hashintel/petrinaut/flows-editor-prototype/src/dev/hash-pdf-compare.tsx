/** Dev harness for the pictures (ops screenshots/picks-built-1113/hash-pdf-viewer/shoot.cjs): HASH's PdfPreview alone, as imported, beside the prototype's viewer. Loaded by dynamic import, never by the app. */
import { Box, Stack, ThemeProvider, Typography } from "@mui/material";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { theme } from "@hashintel/design-system/theme";
import { PdfPreview } from "@hash-frontend-shared/pdf-preview";

import { HashPdfViewer } from "../hash-file-preview/hash-pdf-viewer";

const HashAlone = ({ url, width }: { url: string; width: number }) => {
  const [showSearch, setShowSearch] = useState(false);
  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ width, position: "relative", "& .full-height-and-width-for-react-full-screen": { width: "100%", height: "100%" }, "& .react-pdf-page": { border: "1px solid rgba(0, 0, 0, 0.05)", height: "100%" }, "& .react-pdf-document": { width: "100%", height: "100%" } }} data-hash-alone>
        <PdfPreview url={url} showSearch={showSearch} setShowSearch={setShowSearch} showThumbnails />
      </Box>
    </ThemeProvider>
  );
};

export const mount = (url: string, width: number) => {
  const host = document.createElement("div");
  host.id = "compare-host";
  Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "99999", background: "#fff", padding: "24px", overflow: "auto", fontFamily: "Inter, sans-serif" });
  document.body.append(host);
  createRoot(host).render(
    <Stack direction="row" gap={6} alignItems="flex-start">
      <Stack gap={1.5} sx={{ width }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>HASH · PdfPreview as imported, blue[10]</Typography>
        <HashAlone url={url} width={width} />
      </Stack>
      <Stack gap={1.5} sx={{ width }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Flows prototype · HashPdfViewer, background flows</Typography>
        <HashPdfViewer url={url} />
      </Stack>
    </Stack>,
  );
};
