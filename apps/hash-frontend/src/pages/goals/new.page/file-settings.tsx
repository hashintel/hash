import type { Entity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Box, Stack, SxProps, Theme, Typography } from "@mui/material";
import type { Dispatch } from "react";
import { useState } from "react";

import { useFileUploads } from "../../../shared/file-upload-context";
import { FileUploadDropzone } from "../../settings/shared/file-upload-dropzone";
import { FileIconRegular } from "@hashintel/design-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/src/simplify-properties";

export type FileSettingState = {
  fileEntities: Entity<FileProperties>[];
};

export type FileSettingsProps = {
  settings: FileSettingState;
  setSettings: (settings: Dispatch<FileSettingState>) => void;
  webId: OwnedById;
};

const uploadedFileSx: SxProps<Theme> = {
  color: ({ palette }) => palette.gray[60],
  fontSize: 14,
  mr: 1,
};

const UploadedFile = ({
  fileEntity,
  removeFromFlow,
}: {
  fileEntity: Entity<FileProperties>;
  removeFromFlow: () => void;
}) => {
  const { fileName, fileSize } = simplifyProperties(fileEntity.properties);

  const sizeInKiloBytes = fileSize ? Math.floor(fileSize / 1024) : null;

  return (
    <Stack key={fileEntity.metadata.recordId.entityId}>
      <FileIconRegular sx={uploadedFileSx} />
      <Typography sx={uploadedFileSx}>{fileName}</Typography>
      {sizeInKiloBytes !== null && (
        <Typography sx={uploadedFileSx}>{sizeInKiloBytes}</Typography>
      )}
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
    <div>
      <Box>
        <Typography variant="smallCaps">Choose Files</Typography>
        <FileUploadDropzone
          onFileProvided={onFileProvided}
          showUploadingMessage={!!fileBeingUploaded}
        />
      </Box>
      <Box>
        <Typography variant="smallCaps">Uploaded Files</Typography>
        <Box>
          {settings.fileEntities.map((fileEntity) => (
            <UploadedFile
              fileEntity={fileEntity}
              key={fileEntity.metadata.recordId.entityId}
            />
          ))}
        </Box>
      </Box>
    </div>
  );
};
