import type { RemoteFileEntity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system/theme";
import { Box, ThemeProvider } from "@mui/material";
import { SizeMe } from "react-sizeme";

import { GenerateImage } from "./app/generate-image";
import { ImageTile } from "./shared/image-tile";
import type {
  AIImageBlockOutgoingLinksByLinkEntityTypeId,
  BlockEntity,
  BlockEntityOutgoingLinkAndTarget,
} from "./types/generated/block-entity";

export const descriptionKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";
export const urlKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

export const generatedLinkKey: keyof AIImageBlockOutgoingLinksByLinkEntityTypeId =
  "https://blockprotocol.org/@hash/types/entity-type/generated/v/1";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    BlockEntity,
    BlockEntityOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const fileEntity = linkedEntities.find(
    ({ linkEntity }) => linkEntity.metadata.entityTypeId === generatedLinkKey,
  )?.rightEntity;

  if (readonly && !fileEntity) {
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <SizeMe>
        {({ size }) => {
          const isMobile = (size.width ?? 0) < 400;

          return fileEntity ? (
            <Box
              sx={{
                position: "relative",
                display: "flex",
                width: "100%",
                justifyContent: "center",
              }}
            >
              <ImageTile
                url={fileEntity.properties[urlKey]}
                description={
                  fileEntity.properties[descriptionKey] ??
                  "An AI-generated image"
                }
                maxWidth={400}
              />
            </Box>
          ) : (
            <GenerateImage blockEntity={blockEntity} isMobile={isMobile} />
          );
        }}
      </SizeMe>
    </ThemeProvider>
  );
};
