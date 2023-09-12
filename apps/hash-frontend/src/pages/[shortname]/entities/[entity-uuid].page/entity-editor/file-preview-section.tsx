import { ImageWithCheckedBackground } from "@hashintel/design-system";
import {
  descriptionPropertyTypeUrl,
  fileUrlPropertyTypeUrl,
  mimeTypePropertyTypeUrl,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";

import { generateEntityLabel } from "../../../../../lib/entities";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";

const maxImageHeight = 300;

export const FilePreviewSection = () => {
  const { entitySubgraph } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const mimeType = entity.properties[
    extractBaseUrl(mimeTypePropertyTypeUrl)
  ] as string | undefined;

  const imageUrl = mimeType?.startsWith("image/")
    ? (entity.properties[extractBaseUrl(fileUrlPropertyTypeUrl)] as
        | string
        | undefined)
    : undefined;

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
