import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { FileV2Properties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity, extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  Box,
  Grid,
  GridProps,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { useGetOwnerForEntity } from "../../../../components/hooks/use-get-owner-for-entity";
import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { Link } from "../../../../shared/ui";
import { getFileUrlFromFileProperties } from "../../get-image-url-from-properties";

export const GridViewItem: FunctionComponent<{
  entity: Entity;
  numberOfItems: number;
  index: number;
  sx?: GridProps["sx"];
}> = ({ entity, numberOfItems, index, sx }) => {
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up("md"));

  const numberOfItemsPerRow = isMd ? 4 : 2;

  const isInLastRow =
    index >= numberOfItems - (numberOfItems % numberOfItemsPerRow);

  const isLastInRow = (index + 1) % numberOfItemsPerRow === 0;

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const fileEntity = useMemo(() => {
    const isFileEntity =
      isSpecialEntityTypeLookup?.[entity.metadata.entityTypeId]?.isFile;

    if (isFileEntity) {
      return entity as Entity<FileV2Properties>;
    }
  }, [isSpecialEntityTypeLookup, entity]);

  const { fileName, fileExtension } = useMemo(() => {
    if (fileEntity) {
      const simplifiedProperties = simplifyProperties(fileEntity.properties);

      const { fileName: fullFileName } = simplifiedProperties;

      const parsedFileExtension = fullFileName
        ? fullFileName.split(".").pop()
        : undefined;

      return {
        fileName: parsedFileExtension
          ? fullFileName?.split(".").slice(0, -1).join(".") ?? fullFileName
          : fullFileName,
        fileExtension: parsedFileExtension,
        mimeType: simplifiedProperties.mimeType,
      };
    }

    return {};
  }, [fileEntity]);

  const getOwnerForEntity = useGetOwnerForEntity();

  const href = useMemo(() => {
    const { shortname } = getOwnerForEntity(entity);

    return `/@${shortname}/entities/${extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    )}`;
  }, [getOwnerForEntity, entity]);

  const imageUrl = useMemo(() => {
    const { isImage, url } = getFileUrlFromFileProperties(entity.properties);

    if (isImage) {
      return url;
    }
  }, [entity]);

  return (
    <Grid
      item
      xs={6}
      md={3}
      sx={[
        {
          background: ({ palette }) => palette.common.white,
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderTopWidth: 0,
          borderRightWidth: isLastInRow ? 0 : 1,
          borderLeftWidth: 0,
          borderBottomWidth: isInLastRow ? 0 : 1,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Link href={href} noLinkStyle>
        <Box
          sx={{
            padding: 2,
            width: "100%",
            height: "100%",
            background: "transparent",
            transition: ({ transitions }) => transitions.create("background"),
            "&:hover": {
              background: ({ palette }) => palette.gray[15],
            },
          }}
        >
          <Box
            sx={{
              height: 100,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
                  padding: 3,
                }}
              >
                icon
              </Box>
            )}
          </Box>
          <Typography
            sx={{
              textAlign: "center",
              fontSize: 15,
              color: ({ palette }) => palette.gray[90],
              fontWeight: 600,
            }}
          >
            {fileName}
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
      </Link>
    </Grid>
  );
};
