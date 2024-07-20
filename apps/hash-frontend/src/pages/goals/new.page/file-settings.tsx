import type { Dispatch, SetStateAction , useState } from "react";
import { FileIconRegular, IconButton } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Box, Stack, SxProps, Theme , Typography } from "@mui/material";

import { useFileUploads } from "../../../shared/file-upload-context";
import { XMarkRegularIcon } from "../../../shared/icons/x-mark-regular-icon";
import { FileUploadDropzone } from "../../settings/shared/file-upload-dropzone";

export interface FileSettingsState {
  fileEntities: Entity<FileEntity>[];
}

export interface FileSettingsProps {
  settings: FileSettingsState;
  setSettings: Dispatch<SetStateAction<FileSettingsState>>;
  webId: OwnedById;
}

const uploadedFileSx: SxProps<Theme> = {
  color: ({ palette }) => palette.gray[60],
  fontSize: 14,
  mr: 0.8,
};

const UploadedFile = ({
  fileEntity,
  removeFromFlow,
}: {
  fileEntity: Entity<FileEntity>;
  removeFromFlow: () => void;
}) => {
  const { fileName, fileSize } = simplifyProperties(fileEntity.properties);

  const sizeInKiloBytes = fileSize ? Math.floor(fileSize / 1024) : null;

  return (
    <Stack
      alignItems={"center"}
      direction={"row"}
      key={fileEntity.metadata.recordId.entityId}
    >
      <FileIconRegular sx={uploadedFileSx} />
      <Typography sx={{ ...uploadedFileSx, fontWeight: 500 }}>
        {fileName}
      </Typography>
      {sizeInKiloBytes !== null && (
        <Typography sx={uploadedFileSx}>{sizeInKiloBytes}KB</Typography>
      )}
      <IconButton
        aria-label={"Remove file from Flow"}
        sx={({ palette }) => ({
          "& svg": {
            ...uploadedFileSx,
            color: palette.gray[50],
            m: 0,
          },
          "&:hover": {
            background: "none",
            "& svg": { color: palette.red[70] },
          },
          p: 0.5,
        })}
        onClick={removeFromFlow}
      >
        <XMarkRegularIcon />
      </IconButton>
    </Stack>
  );
};

export const FileSettings = ({
  settings,
  setSettings,
  webId,
}: FileSettingsProps) => {
  const [fileBeingUploaded, setFileBeingUploaded] = useState<File | null>(null);

  const { uploadFile } = useFileUploads();

  const onFileProvided = async (file: File) => {
    setFileBeingUploaded(file);
    await uploadFile({
      fileData: {
        file,
        fileEntityCreationInput: {},
      },
      makePublic: false,
      onComplete: (upload) => {
        setSettings((existingSettings) => ({
          ...existingSettings,
          fileEntities: [
            ...existingSettings.fileEntities,
            upload.createdEntities.fileEntity,
          ],
        }));
        setFileBeingUploaded(null);
      },
      ownedById: webId,
    });
  };

  return (
    <Box mb={3}>
      <Box>
        <Typography variant={"smallCaps"} component={"div"} mb={0.8}>
          Choose Files
        </Typography>
        <FileUploadDropzone
          accept={{ "application/pdf": [".pdf"] }}
          showUploadingMessage={Boolean(fileBeingUploaded)}
          onFileProvided={onFileProvided}
        />
      </Box>
      {settings.fileEntities.length > 0 && (
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
          }}
        >
          <Typography variant={"smallCaps"} component={"div"} mb={0.8}>
            Uploaded Files
          </Typography>
          <Box>
            {settings.fileEntities.map((fileEntity) => (
              <UploadedFile
                fileEntity={fileEntity}
                key={fileEntity.metadata.recordId.entityId}
                removeFromFlow={() =>
                  { setSettings((currentSettings) => ({
                    ...currentSettings,
                    fileEntities: currentSettings.fileEntities.filter(
                      (entity) =>
                        entity.metadata.recordId.entityId !==
                        fileEntity.metadata.recordId.entityId,
                    ),
                  })); }
                }
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
