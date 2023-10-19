import { PenIcon } from "@hashintel/block-design-system";
import { ArrowLeftIcon, LoadingSpinner } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import { GrayToBlueIconButton } from "../../shared/gray-to-blue-icon-button";
import { FileUploadDropzone } from "./file-upload-dropzone";

type ImageFieldProps = {
  imageUrl?: string;
  onFileProvided: (file: File) => Promise<void>;
  readonly: boolean;
};

export const ImageField = ({
  imageUrl: imageUrlFromProps,
  onFileProvided,
  readonly,
}: ImageFieldProps) => {
  const [newImageUploading, setNewImageUploading] = useState(false);
  const [editingImage, setEditingImage] = useState(!imageUrlFromProps);
  const [imageUrl, setImageUrl] = useState(imageUrlFromProps);

  useEffect(() => {
    if (imageUrlFromProps) {
      setEditingImage(false);
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
        <>
          {imageUrl ? (
            <Box sx={{ position: "absolute", top: 5, right: 5 }}>
              <GrayToBlueIconButton
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingImage(false);
                  setImageUrl(imageUrlFromProps);
                }}
                sx={{
                  zIndex: 2,
                }}
              >
                <ArrowLeftIcon sx={{ width: 13, height: 13 }} />
              </GrayToBlueIconButton>{" "}
            </Box>
          ) : null}
          {!readonly && (
            <FileUploadDropzone image onFileProvided={setNewImage} />
          )}
        </>
      ) : (
        <>
          {!readonly && (
            <Box sx={{ position: "absolute", top: 5, right: 5 }}>
              {newImageUploading ? (
                <LoadingSpinner color="gray.40" />
              ) : (
                <GrayToBlueIconButton onClick={() => setEditingImage(true)}>
                  <PenIcon sx={{ width: 13, height: 13 }} />
                </GrayToBlueIconButton>
              )}
            </Box>
          )}
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
