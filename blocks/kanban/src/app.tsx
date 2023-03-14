import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { useRef } from "react";

import { RootEntity, RootEntityLinkedEntities } from "./types.gen";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const entityId = blockEntity.metadata.recordId.entityId;

  const nameKey: keyof RootEntity["properties"] =
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/";

  const title = blockEntity.properties[nameKey] ?? "";

  return (
    <div ref={blockRootRef}>
      <h1>{`Hello, ${title}`}</h1>
      <p>
        The entityId of this block is {entityId}. Use it to update its data,
        e.g. by calling <code>updateEntity</code>.
      </p>
      <button
        onClick={() =>
          graphModule.updateEntity({
            data: {
              entityId,
              entityTypeId: blockEntity.metadata.entityTypeId,
              properties: { [nameKey]: "New Name" },
            },
          })
        }
        type="button"
      >
        Update Name
      </button>
    </div>
  );
};
