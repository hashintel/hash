import { ImageIconSolid } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

type FileDropzoneProps = {
  onFileProvided: (file: File) => void;
};

export const ImageUploadDropzone = ({ onFileProvided }: FileDropzoneProps) => {
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
    accept: {
      "image/gif": [".gif"],
      "image/png": [".png"],
      "image/jpeg": [".jpeg"],
      "image/jpg": [".jpg"],
      "image/svg+xml": [".svg"],
    },
    maxFiles: 1,
    maxSize: 10_000_000, // 10 MB
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
      <ImageIconSolid sx={{ color: "gray.30", fontSize: 48, mb: 1 }} />
      <Typography
        variant="smallTextLabels"
        sx={{ color: "blue.70", display: "block", fontWeight: 600 }}
      >
        Upload an image
      </Typography>
      <Typography
        variant="smallTextLabels"
        sx={{ color: "gray.90", display: "block", fontWeight: 600 }}
      >
        or drag and drop
      </Typography>
      <Typography
        variant="microText"
        sx={{ color: "gray.50", display: "block", mt: 1, fontWeight: 500 }}
      >
        PNG, JPG, GIF, SVG
        <br /> up to 10MB
      </Typography>
    </Box>
  );
};
