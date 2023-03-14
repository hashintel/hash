import { RemoteFileEntity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";

import { GenerateImage } from "./app/generate-image";
import { Image } from "./app/image";
import {
  AIImageBlockLinksByLinkTypeId,
  RootEntity,
  RootEntityLinkedEntities,
} from "./types";

export const descriptionKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";
export const urlKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

export const generatedLinkKey: keyof AIImageBlockLinksByLinkTypeId =
  "https://blockprotocol.org/@hash/types/entity-type/generated/v/1";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const fileEntity = linkedEntities.find(
    ({ linkEntity }) => linkEntity.metadata.entityTypeId === generatedLinkKey,
  )?.rightEntity;

  if (readonly && !fileEntity) {
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      {fileEntity ? (
        <div style={{ position: "relative", width: "100%" }}>
          <Image
            description={
              fileEntity.properties[descriptionKey] ?? "An AI-generated image"
            }
            url={fileEntity.properties[urlKey]}
          />
        </div>
      ) : (
        <GenerateImage blockEntity={blockEntity} />
      )}
    </ThemeProvider>
  );
};
