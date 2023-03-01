import { RemoteFileEntity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";

import { GenerateImage } from "./app/generate-image";
import { Image } from "./app/image";
import { RootEntity, RootEntityLinkedEntities } from "./types";

export const descriptionKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";
export const urlKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const fileEntity = linkedEntities.find(
    ({ linkEntity }) =>
      linkEntity.metadata.entityTypeId ===
      "https://blockprotocol.org/@hash/types/entity-type/generated/v/1",
  )?.rightEntity;

  if (readonly && !fileEntity) {
    return null;
  }

  if (fileEntity) {
    return (
      <div style={{ position: "relative", width: "100%" }}>
        <Image
          description={
            fileEntity.properties[descriptionKey] ?? "An AI-generated image"
          }
          url={fileEntity.properties[urlKey]}
        />
      </div>
    );
  }

  return <GenerateImage blockEntity={blockEntity} />;
};
