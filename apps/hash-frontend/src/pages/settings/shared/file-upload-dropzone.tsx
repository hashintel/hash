import { mustHaveAtLeastOne } from "@blockprotocol/type-system";
import { ImageSolidIcon } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { useCallback } from "react";
import type { Accept } from "react-dropzone";
import { useDropzone } from "react-dropzone";

import { UploadIcon } from "../../../shared/icons/upload-icon";

type FileUploadDropzoneProps = {
  /** @see https://react-dropzone.js.org/#section-accepting-specific-file-types */
  accept?: Accept;
  image?: boolean;
  multiple?: boolean;
  onFilesProvided: (files: [File, ...File[]]) => void;
  showUploadingMessage?: boolean;
};

export const FileUploadDropzone = ({
  accept,
  image,
  multiple,
  onFilesProvided,
  showUploadingMessage,
}: FileUploadDropzoneProps) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!acceptedFiles[0]) {
        throw new Error("No file provided");
      }
      onFilesProvided(mustHaveAtLeastOne(acceptedFiles));
    },
    [onFilesProvided],
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
    multiple,
  });

  return (
    <Box
      {...getRootProps({ className: "dropzone" })}
      sx={({ palette }) => ({
        alignItems: "center",
        border: `1px dashed ${palette.gray[40]}`,
        borderRadius: 1,
        cursor: showUploadingMessage ? "not-allowed" : "pointer",
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
      {!showUploadingMessage && <Box component="input" {...getInputProps()} />}
      {image ? (
        <ImageSolidIcon sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      ) : (
        <UploadIcon sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      )}
      <Typography
        variant="smallTextLabels"
        sx={{ color: "blue.70", display: "block", fontWeight: 600 }}
      >
        {showUploadingMessage ? "Uploading..." : "Click to upload"}
      </Typography>
      <Typography
        variant="smallTextLabels"
        sx={{
          color: showUploadingMessage ? "gray.60" : "gray.90",
          display: "block",
          fontWeight: 600,
        }}
      >
        {showUploadingMessage ? (
          <>please wait for completion...</>
        ) : (
          `or drag and drop ${multiple ? "files" : "a file"}`
        )}
      </Typography>
      <Typography
        variant="microText"
        sx={{ color: "gray.50", display: "block", mt: 1, fontWeight: 500 }}
      >
        {image
          ? "Any image file accepted"
          : accept
            ? `Accepts ${Object.values(accept).flat().join(", ")} files`
            : "All file types accepted"}
      </Typography>
    </Box>
  );
};
