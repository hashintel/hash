import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import { extractBaseUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { FileAudioLightIcon } from "../../../../../shared/icons/file-audio-light-icon";
import { FileExcelLightIcon } from "../../../../../shared/icons/file-excel-light-icon";
import { FileImageLightIcon } from "../../../../../shared/icons/file-image-light";
import { FileLightIcon } from "../../../../../shared/icons/file-light-icon";
import { FilePdfLightIcon } from "../../../../../shared/icons/file-pdf-light-icon";
import { FilePowerpointLightIcon } from "../../../../../shared/icons/file-powerpoint-light-icon";
import { FileVideoLightIcon } from "../../../../../shared/icons/file-video-light-icon";
import { FileWordLightIcon } from "../../../../../shared/icons/file-word-light-icon";
import { getImageUrlFromEntityProperties } from "../../../get-file-properties";
import { GridViewItemWrapper } from "./grid-view-item-wrapper";

/**
 * @todo: gradually we will want to rely more on entity types to determine the icon
 * as we introduce more sub-types of the `File` entity type. We provide these as a
 * fallback for now.
 */
const mimeTypeStartsWithToIcon: Record<string, ReactNode> = {
  "image/": <FileImageLightIcon />,
  "video/": <FileVideoLightIcon />,
  "audio/": <FileAudioLightIcon />,
  "application/pdf": <FilePdfLightIcon />,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
    <FileWordLightIcon />
  ),
  "application/msword": <FileWordLightIcon />,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": (
    <FilePowerpointLightIcon />
  ),
  "application/vnd.ms-powerpoint": <FilePowerpointLightIcon />,
  "application/vnd.ms-excel": <FileExcelLightIcon />,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
    <FileExcelLightIcon />
  ),
};

const entityTypeIdToIcon: Record<BaseUrl, ReactNode> = {
  [systemEntityTypes.pptxPresentation.entityTypeBaseUrl]: (
    <FilePowerpointLightIcon />
  ),
  [systemEntityTypes.pdfDocument.entityTypeBaseUrl]: <FilePdfLightIcon />,
  [systemEntityTypes.docxDocument.entityTypeBaseUrl]: <FileWordLightIcon />,
  [systemEntityTypes.imageFile.entityTypeBaseUrl]: <FileImageLightIcon />,
};

const defaultFileIcon = <FileLightIcon />;

export const GridViewItem: FunctionComponent<{
  entity: HashEntity;
  numberOfItems: number;
  index: number;
  onEntityClick: (entityId: EntityId) => void;
}> = ({ entity, numberOfItems, index, onEntityClick }) => {
  const { includesSpecialEntityTypes } = useEntityTypesContextRequired();

  const fileEntity = useMemo(() => {
    const isFileEntity = includesSpecialEntityTypes?.(
      entity.metadata.entityTypeIds,
    ).isFile;

    if (isFileEntity) {
      return entity as HashEntity<FileEntity>;
    }
  }, [includesSpecialEntityTypes, entity]);

  const { fileName, fileNameWithoutExtension, fileExtension } = useMemo(() => {
    if (fileEntity) {
      const { fileName: fullFileName } = simplifyProperties(
        fileEntity.properties,
      );

      const parsedFileExtension = fullFileName
        ? fullFileName.split(".").pop()
        : undefined;

      return {
        fileName: fullFileName,
        fileNameWithoutExtension: parsedFileExtension
          ? (fullFileName?.split(".").slice(0, -1).join(".") ?? fullFileName)
          : fullFileName,
        fileExtension: parsedFileExtension,
      };
    }

    return {};
  }, [fileEntity]);

  const icon = useMemo(() => {
    if (fileEntity) {
      let specificIcon: ReactNode;

      for (const entityTypeId of fileEntity.metadata.entityTypeIds) {
        specificIcon = entityTypeIdToIcon[extractBaseUrl(entityTypeId)];
        if (specificIcon) {
          return specificIcon;
        }
      }

      const { mimeType } = simplifyProperties(fileEntity.properties);

      const iconByMimeType = mimeType
        ? Object.entries(mimeTypeStartsWithToIcon).find(([startsWith]) =>
            mimeType.startsWith(startsWith),
          )?.[1]
        : undefined;

      if (iconByMimeType) {
        return iconByMimeType;
      }
    }
    return defaultFileIcon;
  }, [fileEntity]);

  const imageUrl = useMemo(() => {
    return getImageUrlFromEntityProperties(entity.properties);
  }, [entity]);

  return (
    <GridViewItemWrapper numberOfItems={numberOfItems} index={index}>
      <Box
        role="button"
        title={fileName}
        onClick={() => onEntityClick(entity.metadata.recordId.entityId)}
        sx={{
          cursor: "pointer",
          padding: 3,
          width: "100%",
          height: "100%",
          background: "transparent",
          transition: ({ transitions }) => transitions.create("background"),
          "&:hover": {
            background: ({ palette }) => palette.gray[15],
          },
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            height: 150,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 1,
          }}
        >
          {imageUrl ? (
            <Box
              component="img"
              src={imageUrl}
              alt={fileName ?? "image"}
              sx={{
                borderRadius: "4px",
                objectFit: "contain",
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            />
          ) : (
            <Box
              sx={{
                borderRadius: "16px",
                borderColor: ({ palette }) => palette.teal[30],
                borderStyle: "solid",
                borderWidth: 1,
                background: ({ palette }) => palette.teal[10],
                width: 100,
                height: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                svg: {
                  color: ({ palette }) => palette.teal[90],
                  fontSize: 40,
                },
              }}
            >
              {icon}
            </Box>
          )}
        </Box>
        <Box
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Typography
            sx={{
              textAlign: "center",
              fontSize: 15,
              color: ({ palette }) => palette.gray[90],
              fontWeight: 600,
              display: "-webkit-box",
              webkitLineClamp: "2",
              webkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {fileNameWithoutExtension}
            {fileExtension ? (
              <Box
                component="span"
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontWeight: 400,
                }}
              >
                .{fileExtension}
              </Box>
            ) : undefined}
          </Typography>
        </Box>
      </Box>
    </GridViewItemWrapper>
  );
};
