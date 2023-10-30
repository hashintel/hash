import {
  ArrowLeftIcon,
  DownloadIconRegular,
  FileIconRegular,
  ImageWithCheckedBackground,
  RotateIconRegular,
} from "@hashintel/design-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  Box,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { PropsWithChildren, useState } from "react";

import { generateEntityLabel } from "../../../../../lib/entities";
import {
  useFileUploads,
  useFileUploadsProgress,
} from "../../../../../shared/file-upload-context";
import { FileUploadDropzone } from "../../../../settings/shared/file-upload-dropzone";
import { useAuthInfo } from "../../../../shared/auth-info-context";
import { getFileUrlFromFileProperties } from "../../../../shared/get-image-url-from-properties";
import { GrayToBlueIconButton } from "../../../../shared/gray-to-blue-icon-button";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";

const previewHeight = 250;

const ActionButtonsContainer = ({ children }: PropsWithChildren) => (
  <Stack
    direction="row"
    spacing={1}
    sx={{
      position: "absolute",
      top: 10,
      right: 10,
    }}
  >
    {children}
  </Stack>
);

const ReplaceFile = ({
  description,
  displayName,
  isImage,
  close,
}: {
  description?: string;
  displayName?: string;
  isImage: boolean;
  close: () => void;
}) => {
  const { entitySubgraph, replaceWithLatestDbVersion } = useEntityEditor();
  const { refetch: refetchUser } = useAuthInfo();
  const [fileBeingUploaded, setFileBeingUploaded] = useState<File | null>(null);

  const entity = getRoots(entitySubgraph)[0]!;

  const { uploadFile, uploads } = useFileUploads();
  const uploadsProgress = useFileUploadsProgress();

  const upload = uploads.find((option) =>
    "fileEntityUpdateInput" in option.fileData &&
    option.fileData.fileEntityUpdateInput.existingFileEntityId ===
      entity.metadata.recordId.entityId &&
    "file" in option.fileData
      ? option.fileData.file === fileBeingUploaded
      : false,
  );
  const progress = upload ? uploadsProgress[upload.requestId] : 0;

  const onFileProvided = async (file: File) => {
    setFileBeingUploaded(file);
    try {
      await uploadFile({
        fileData: {
          file,
          description,
          name: displayName,
          fileEntityUpdateInput: {
            existingFileEntityId: entity.metadata.recordId.entityId,
          },
        },
        makePublic: false, // maintain existing visibility settings
        ownedById: extractOwnedByIdFromEntityId(
          entity.metadata.recordId.entityId,
        ),
      });
      await replaceWithLatestDbVersion();
    } finally {
      setFileBeingUploaded(null);
    }

    // Refetch the user in case we've replaced a file connected to them (e.g. avatar)
    void refetchUser();

    close();
  };

  if (fileBeingUploaded) {
    return (
      <Box sx={{ position: "relative" }}>
        <CircularProgress
          color={upload?.status === "error" ? "error" : "primary"}
          size={72}
          variant="determinate"
          value={progress}
        />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography
            variant="smallTextLabels"
            sx={{ fontWeight: 500, mb: 1 }}
          >{`${(progress ?? 0).toFixed(0)}%`}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <>
      <FileUploadDropzone image={isImage} onFileProvided={onFileProvided} />
      <ActionButtonsContainer>
        <Tooltip title="Cancel">
          <Box>
            <GrayToBlueIconButton onClick={close}>
              <ArrowLeftIcon sx={{ width: 13, height: 13 }} />
            </GrayToBlueIconButton>
          </Box>
        </Tooltip>
      </ActionButtonsContainer>
    </>
  );
};

export const FilePreviewSection = () => {
  const [replacing, setReplacing] = useState(false);

  const { isDirty, entitySubgraph } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const { isImage, url } = getFileUrlFromFileProperties(entity.properties);

  if (!url) {
    return null;
  }

  const { description, displayName, fileName } = simplifyProperties(
    entity.properties as FileProperties,
  );

  const title = displayName ?? generateEntityLabel(entitySubgraph);

  const alt = description ?? title;

  return (
    <SectionWrapper title="File Preview">
      <Stack
        sx={({ boxShadows }) => ({
          alignItems: "center",
          justifyContent: "center",
          boxShadow: boxShadows.sm,
          borderRadius: 1,
          height: previewHeight,
          position: "relative",
        })}
      >
        {replacing ? (
          <ReplaceFile
            close={() => setReplacing(false)}
            description={description}
            displayName={displayName}
            isImage={!!isImage}
          />
        ) : (
          <>
            <ActionButtonsContainer>
              <Tooltip
                placement="top"
                title={
                  isDirty
                    ? "Save or discard your changes to replace the file"
                    : "Replace"
                }
              >
                <Box>
                  <GrayToBlueIconButton
                    disabled={isDirty}
                    onClick={() => setReplacing(true)}
                  >
                    <RotateIconRegular sx={{ width: 13, height: 13 }} />
                  </GrayToBlueIconButton>
                </Box>
              </Tooltip>
              <Tooltip placement="top" title="Download">
                <Box
                  component="a"
                  href={url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                >
                  <GrayToBlueIconButton>
                    <DownloadIconRegular sx={{ width: 13, height: 13 }} />
                  </GrayToBlueIconButton>
                </Box>
              </Tooltip>
            </ActionButtonsContainer>
            {isImage ? (
              <ImageWithCheckedBackground
                alt={alt}
                src={url}
                sx={{ height: previewHeight }}
              />
            ) : (
              <Stack alignItems="center" spacing={2}>
                <FileIconRegular
                  sx={{
                    color: ({ palette }) => palette.gray[50],
                    fontSize: 48,
                  }}
                />
                <Typography sx={{ color: ({ palette }) => palette.gray[70] }}>
                  {fileName}
                </Typography>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </SectionWrapper>
  );
};
