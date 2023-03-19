import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { useMemo, useRef } from "react";

import { RootEntityKey } from "./additional-types";
import styles from "./base.module.scss";
import { Board } from "./components/board/board";
import { BoardTitle } from "./components/board-title/board-title";
import { RootEntity, RootEntityLinkedEntities } from "./types";

const titleKey: RootEntityKey =
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId: blockEntityId },
      entityTypeId: blockEntityTypeId,
    },
    properties: { [titleKey]: title = "" },
  } = blockEntity;

  const updateEntity = useMemo(
    () => async (newProperties: RootEntity["properties"]) => {
      await graphModule.updateEntity({
        data: {
          entityId: blockEntityId,
          entityTypeId: blockEntityTypeId,
          properties: { ...blockEntity.properties, ...newProperties },
        },
      });
    },
    [blockEntityId, blockEntityTypeId, blockEntity.properties, graphModule],
  );

  const setTitle = async (val: string) => {
    await updateEntity({ [titleKey]: val });
  };

  return (
    <div className={styles.block} ref={blockRootRef}>
      <BoardTitle title={title} onChange={setTitle} readonly={readonly} />
      <Board updateEntity={updateEntity} blockEntity={blockEntity} />
    </div>
  );
};
