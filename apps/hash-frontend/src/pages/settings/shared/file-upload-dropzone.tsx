import { ImageIconSolid } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

import { UploadIcon } from "../../../shared/icons/upload-icon";

type FileUploadDropzoneProps = {
  image?: boolean;
  onFileProvided: (file: File) => void;
};

export const FileUploadDropzone = ({
  image,
  onFileProvided,
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
    accept: image
      ? {
          "image/*": [],
        }
      : undefined,
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
      <Box component="input" {...getInputProps()} />
      {image ? (
        <ImageIconSolid sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      ) : (
        <UploadIcon sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      )}
      <Typography
        variant="smallTextLabels"
        sx={{ color: "blue.70", display: "block", fontWeight: 600 }}
      >
        Click to upload
      </Typography>
      <Typography
        variant="smallTextLabels"
        sx={{ color: "gray.90", display: "block", fontWeight: 600 }}
      >
        or drag and drop a file
      </Typography>
      <Typography
        variant="microText"
        sx={{ color: "gray.50", display: "block", mt: 1, fontWeight: 500 }}
      >
        {image ? "Any image file accepted" : "All file types accepted"}
      </Typography>
    </Box>
  );
};
