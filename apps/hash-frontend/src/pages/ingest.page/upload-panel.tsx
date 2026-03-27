/**
 * Upload panel: drag-and-drop PDF upload with progress display.
 *
 * Uses Ark UI FileUpload for accessible drag-and-drop, and MUI for layout.
 */
import { FileUpload } from "@ark-ui/react";
import { Box, CircularProgress, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

import { Button } from "../../shared/ui/button";
import { getCountsSummary, getProgressLabel } from "./progress-labels";
import type { ActiveRunStatus } from "./types";
import type { DoneIngestRunState, IngestRunState } from "./use-ingest-run";

// ---------------------------------------------------------------------------
// Sub-components (defined first to satisfy no-use-before-define)
// ---------------------------------------------------------------------------

const StatusCard: FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Box
    sx={{
      border: ({ palette }) => `1px solid ${palette.gray[30]}`,
      borderRadius: 2,
      p: 4,
      textAlign: "center",
      maxWidth: 400,
      mx: "auto",
    }}
  >
    {children}
  </Box>
);

const RunProgress: FunctionComponent<{ status: ActiveRunStatus }> = ({
  status,
}) => {
  const label = getProgressLabel(status);
  const counts = getCountsSummary(status.counts);

  return (
    <Box>
      <Typography fontWeight={600} sx={{ mb: 0.25 }}>
        {label}
      </Typography>
      {counts && (
        <Typography
          variant="smallTextLabels"
          sx={{ color: "gray.60", mt: 0.5 }}
        >
          {counts}
        </Typography>
      )}
      <Typography variant="microText" sx={{ color: "gray.50", mt: 1 }}>
        Run: {status.runId.slice(0, 8)}…
      </Typography>
    </Box>
  );
};

const getFailedRunError = (state: DoneIngestRunState): string | undefined =>
  state.runStatus.status === "failed" ? state.runStatus.error : undefined;

const DropZone: FunctionComponent<{ onUpload: (file: File) => void }> = ({
  onUpload,
}) => (
  <FileUpload.Root
    accept={{ "application/pdf": [".pdf"] }}
    maxFiles={1}
    onFileAccept={(details: { files: File[] }) => {
      const file = details.files[0];
      if (file) {
        onUpload(file);
      }
    }}
  >
    <FileUpload.Dropzone
      style={{
        border: "2px dashed",
        borderColor: "rgba(0, 0, 0, 0.23)",
        borderRadius: "8px",
        padding: "3rem 2rem",
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, mb: 1 }}>
        Drop a PDF here
      </Typography>
      <Typography variant="smallTextLabels" sx={{ color: "gray.60", mb: 2 }}>
        or click to browse
      </Typography>
      <FileUpload.Trigger asChild>
        <Button variant="secondary" size="small">
          Choose File
        </Button>
      </FileUpload.Trigger>
    </FileUpload.Dropzone>
    <FileUpload.HiddenInput />
  </FileUpload.Root>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UploadPanelProps {
  state: IngestRunState;
  onUpload: (file: File) => void;
  onReset: () => void;
}

export const UploadPanel: FunctionComponent<UploadPanelProps> = ({
  state,
  onUpload,
  onReset,
}) => {
  if (state.phase === "idle") {
    return <DropZone onUpload={onUpload} />;
  }

  if (state.phase === "uploading") {
    return (
      <StatusCard>
        <CircularProgress size={32} sx={{ mb: 1.5 }} />
        <Typography fontWeight={600}>Uploading PDF…</Typography>
      </StatusCard>
    );
  }

  if (state.phase === "streaming") {
    return (
      <StatusCard>
        <CircularProgress size={32} sx={{ mb: 1.5 }} />
        <RunProgress status={state.runStatus} />
      </StatusCard>
    );
  }

  if (state.phase === "done") {
    const countsSummary = getCountsSummary(state.runStatus.counts);
    return (
      <StatusCard>
        {state.runStatus.status === "succeeded" ? (
          <>
            <Typography fontWeight={600} sx={{ mb: 0.5 }}>
              Pipeline complete!
            </Typography>
            {countsSummary && (
              <Typography
                variant="smallTextLabels"
                sx={{ color: "gray.60", mt: 0.5 }}
              >
                {countsSummary}
              </Typography>
            )}
            <Typography
              variant="smallTextLabels"
              sx={{ color: "gray.60", mt: 2 }}
            >
              Opening results…
            </Typography>
          </>
        ) : (
          <>
            <Typography fontWeight={600} sx={{ mb: 0.5 }}>
              Pipeline failed
            </Typography>
            {getFailedRunError(state) && (
              <Typography variant="smallTextLabels" sx={{ color: "red.70" }}>
                {getFailedRunError(state)}
              </Typography>
            )}
            <Button
              variant="secondary"
              size="small"
              onClick={onReset}
              sx={{ mt: 2 }}
            >
              Try Again
            </Button>
          </>
        )}
      </StatusCard>
    );
  }

  // error phase
  return (
    <StatusCard>
      <Typography fontWeight={600} sx={{ mb: 0.5 }}>
        Error
      </Typography>
      <Typography variant="smallTextLabels" sx={{ color: "red.70" }}>
        {state.message}
      </Typography>
      <Button variant="secondary" size="small" onClick={onReset} sx={{ mt: 2 }}>
        Try Again
      </Button>
    </StatusCard>
  );
};
