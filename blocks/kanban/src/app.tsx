import { type BlockComponent } from "@blockprotocol/graph/react";
import { useState } from "react";

import styles from "./base.module.scss";
import { Board } from "./components/board/board";
import { BoardTitle } from "./components/board-title/board-title";
import { RootEntity } from "./types.gen";

export const App: BlockComponent<RootEntity> = () =>
  // {
  //   graph: { blockEntitySubgraph },
  // }
  {
    // const blockRootRef = useRef<HTMLDivElement>(null);
    // const { graphModule } = useGraphBlockModule(blockRootRef);

    // const { rootEntity: blockEntity } = useEntitySubgraph<
    //   RootEntity,
    //   RootEntityLinkedEntities
    // >(blockEntitySubgraph);

    // const entityId = blockEntity.metadata.recordId.entityId;

    // const nameKey: keyof RootEntity["properties"] =
    //   "https://blockprotocol.org/@blockprotocol/types/property-type/name/";

    const [title, setTitle] = useState("");

    return (
      <div
        className={styles.block}
        // ref={blockRootRef}
      >
        <BoardTitle title={title} onChange={setTitle} />
        <Board />
      </div>
    );
  };
