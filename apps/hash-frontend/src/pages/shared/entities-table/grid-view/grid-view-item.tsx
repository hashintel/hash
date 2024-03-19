import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { BaseUrl, Entity } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { FileAudioLightIcon } from "../../../../shared/icons/file-audio-light-icon";
import { FileExcelLightIcon } from "../../../../shared/icons/file-excel-light-icon";
import { FileImageLightIcon } from "../../../../shared/icons/file-image-light";
import { FileLightIcon } from "../../../../shared/icons/file-light-icon";
import { FilePdfLightIcon } from "../../../../shared/icons/file-pdf-light-icon";
import { FilePowerpointLightIcon } from "../../../../shared/icons/file-powerpoint-light-icon";
import { FileVideoLightIcon } from "../../../../shared/icons/file-video-light-icon";
import { FileWordLightIcon } from "../../../../shared/icons/file-word-light-icon";
import { Link } from "../../../../shared/ui";
import { getFileUrlFromFileProperties } from "../../get-image-url-from-properties";
import { useEntityHref } from "../../use-entity-href";
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
  [systemEntityTypes.pptxPresentation.entityTypeBaseUrl as BaseUrl]: (
    <FilePowerpointLightIcon />
  ),
  [systemEntityTypes.pdfDocument.entityTypeBaseUrl as BaseUrl]: (
    <FilePdfLightIcon />
  ),
  [systemEntityTypes.docxDocument.entityTypeBaseUrl as BaseUrl]: (
    <FileWordLightIcon />
  ),
  [systemEntityTypes.image.entityTypeBaseUrl as BaseUrl]: (
    <FileImageLightIcon />
  ),
};

const defaultFileIcon = <FileLightIcon />;

export const GridViewItem: FunctionComponent<{
  entity: Entity;
  numberOfItems: number;
  index: number;
}> = ({ entity, numberOfItems, index }) => {
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const fileEntity = useMemo(() => {
    const isFileEntity =
      isSpecialEntityTypeLookup?.[entity.metadata.entityTypeId]?.isFile;

    if (isFileEntity) {
      return entity as Entity<FileProperties>;
    }
  }, [isSpecialEntityTypeLookup, entity]);

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
          ? fullFileName?.split(".").slice(0, -1).join(".") ?? fullFileName
          : fullFileName,
        fileExtension: parsedFileExtension,
      };
    }

    return {};
  }, [fileEntity]);

  const icon = useMemo(() => {
    if (fileEntity) {
      const iconByEntityType =
        entityTypeIdToIcon[extractBaseUrl(fileEntity.metadata.entityTypeId)];

      if (iconByEntityType) {
        return iconByEntityType;
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

  const href = useEntityHref(entity);

  const imageUrl = useMemo(() => {
    const { isImage, url } = getFileUrlFromFileProperties(entity.properties);

    if (isImage) {
      return url;
    }
  }, [entity]);

  return (
    <GridViewItemWrapper numberOfItems={numberOfItems} index={index}>
      <Link href={href} noLinkStyle>
        <Box
          title={fileName}
          sx={{
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
                "-webkit-line-clamp": "2",
                "-webkit-box-orient": "vertical",
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
      </Link>
    </GridViewItemWrapper>
  );
};
