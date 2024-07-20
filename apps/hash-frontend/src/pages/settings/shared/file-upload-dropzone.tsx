import { useCallback } from "react";
import type { Accept, useDropzone } from "react-dropzone";
import { ImageIconSolid } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";

import { UploadIcon } from "../../../shared/icons/upload-icon";

interface FileUploadDropzoneProps {
  /** @see https://react-dropzone.js.org/#section-accepting-specific-file-types */
  accept?: Accept;
  image?: boolean;
  onFileProvided: (file: File) => void;
  showUploadingMessage?: boolean;
}

export const FileUploadDropzone = ({
  accept,
  image,
  onFileProvided,
  showUploadingMessage,
}: FileUploadDropzoneProps) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const providedFile = acceptedFiles[0];

      if (!providedFile) {
        throw new Error("No file provided");
      }
      onFileProvided(providedFile);
    },
    [onFileProvided],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept:
      accept ??
      (image
        ? {
            "image/*": [],
          }
        : undefined),
    maxFiles: 1,
    multiple: false,
  });

  return (
    <Box
      {...getRootProps({ className: "dropzone" })}
      sx={({ palette }) => ({
        alignItems: "center",
        border: `1px dashed ${palette.gray[40]}`,
        borderRadius: 1,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        flexWrap: "wrap",
        height: "100%",
        justifyContent: "center",
        padding: 3,
        textAlign: "center",
        width: "100%",
        transition: ({ transitions }) => transitions.create("opacity"),
        "&:hover": {
          opacity: 0.8,
        },
      })}
    >
      {!showUploadingMessage && (
        <Box component={"input"} {...getInputProps()} />
      )}
      {image ? (
        <ImageIconSolid sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      ) : (
        <UploadIcon sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      )}
      <Typography
        variant={"smallTextLabels"}
        sx={{ color: "blue.70", display: "block", fontWeight: 600 }}
      >
        {showUploadingMessage ? "Uploading..." : "Click to upload"}
      </Typography>
      <Typography
        variant={"smallTextLabels"}
        sx={{
          color: showUploadingMessage ? "gray.60" : "gray.90",
          display: "block",
          fontWeight: 600,
        }}
      >
        {showUploadingMessage ? <>&nbsp;</> : "or drag and drop a file"}
      </Typography>
      <Typography
        variant={"microText"}
        sx={{ color: "gray.50", display: "block", mt: 1, fontWeight: 500 }}
      >
        {image ? "Any image file accepted" : "All file types accepted"}
      </Typography>
    </Box>
  );
};
