import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";

import { ConfirmedText } from "./app/confirmed-text";
import { GenerateText } from "./app/generate-text";
import { RootEntity } from "./types";

export const contentKey: keyof RootEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);

  const textContent = rootEntity.properties[contentKey];

  if (textContent || readonly) {
    if (!textContent) {
      return null;
    }

    return (
      <ConfirmedText
        entityId={rootEntity.metadata.recordId.entityId}
        text={textContent}
      />
    );
  }

  return <GenerateText blockEntity={rootEntity} />;
};
