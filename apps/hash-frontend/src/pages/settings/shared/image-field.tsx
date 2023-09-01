import { PenIcon } from "@hashintel/block-design-system";
import { IconButton, LoadingSpinner } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import { FileUploadDropzone } from "./file-upload-dropzone";

type ImageFieldProps = {
  imageUrl?: string;
  onFileProvided: (file: File) => Promise<void>;
};

export const ImageField = ({
  imageUrl: imageUrlFromProps,
  onFileProvided,
}: ImageFieldProps) => {
  const [newImageUploading, setNewImageUploading] = useState(false);
  const [editingImage, setEditingImage] = useState(!imageUrlFromProps);
  const [imageUrl, setImageUrl] = useState(imageUrlFromProps);

  useEffect(() => {
    if (imageUrlFromProps) {
      setImageUrl(imageUrlFromProps);
    }
  }, [imageUrlFromProps]);

  const setNewImage = async (file: File) => {
    setNewImageUploading(true);
    try {
      setEditingImage(false);
      setImageUrl(URL.createObjectURL(file));
      await onFileProvided(file);
    } catch {
      setEditingImage(true);
      setImageUrl(imageUrlFromProps);
    }
    setNewImageUploading(false);
  };

  return (
    <Box
      sx={({ palette }) => ({
        borderRadius: 2,
        border: `1px solid ${palette.gray[20]}`,
        width: "100%",
        height: "100%",
        position: "relative",
      })}
    >
      {editingImage ? (
        <FileUploadDropzone image onFileProvided={setNewImage} />
      ) : (
        <>
          <Box sx={{ position: "absolute", top: 2, right: 2 }}>
            {newImageUploading ? (
              <LoadingSpinner color="gray.40" />
            ) : (
              <IconButton
                onClick={() => setEditingImage(true)}
                sx={{
                  color: "gray.50",
                  p: 1,
                  transition: ({ transitions }) => transitions.create("color"),
                  "&:hover": {
                    color: "gray.10",
                    background: "none",
                  },
                }}
              >
                <PenIcon />
              </IconButton>
            )}
          </Box>
          <Box
            component="img"
            src={imageUrl}
            sx={{
              borderRadius: 2,
              objectFit: "cover",
              height: "100%",
              width: "100%",
            }}
          />
        </>
      )}
    </Box>
  );
};
