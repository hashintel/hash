import { ImageWithCheckedBackground } from "@hashintel/design-system";
import { descriptionPropertyTypeUrl } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";

import { generateEntityLabel } from "../../../../../lib/entities";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import { getImageUrlFromFileProperties } from "./shared/get-image-url-from-properties";

const maxImageHeight = 300;

export const FilePreviewSection = () => {
  const { entitySubgraph } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const imageUrl = getImageUrlFromFileProperties(entity.properties);

  if (!imageUrl) {
    return null;
  }

  const description = entity.properties[
    extractBaseUrl(descriptionPropertyTypeUrl)
  ] as string | undefined;

  const title = generateEntityLabel(entitySubgraph);

  const alt = description ?? title;

  return (
    <SectionWrapper title="File Preview">
      <Box
        sx={({ boxShadows }) => ({
          boxShadow: boxShadows.sm,
          borderRadius: 1,
          maxHeight: maxImageHeight,
        })}
      >
        <ImageWithCheckedBackground
          alt={alt}
          src={imageUrl}
          sx={{ maxHeight: maxImageHeight }}
        />
      </Box>
    </SectionWrapper>
  );
};
