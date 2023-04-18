import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { useRef } from "react";

import { RootKey } from "./additional-types";
import styles from "./base.module.scss";
import { Settings } from "./components/settings/settings";
import { Table } from "./components/table/table";
import { TableTitle } from "./components/table-title/table-title";
import {
  BlockEntity,
  TableBlockOutgoingLinkAndTarget,
} from "./types/generated/block-entity";

const titleKey: RootKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    BlockEntity,
    TableBlockOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId: blockEntityId },
      entityTypeId: blockEntityTypeId,
    },
    properties: { [titleKey]: title = "" },
  } = blockEntity;

  const updateEntity = async (newProperties: BlockEntity["properties"]) => {
    await graphModule.updateEntity({
      data: {
        entityId: blockEntityId,
        entityTypeId: blockEntityTypeId,
        properties: { ...blockEntity.properties, ...newProperties },
      },
    });
  };

  const setTitle = async (val: string) => {
    await updateEntity({ [titleKey]: val });
  };

  return (
    <div className={styles.block} ref={blockRootRef}>
      <div className={styles.titleWrapper}>
        <TableTitle onChange={setTitle} title={title} readonly={readonly} />
        {!readonly && (
          <Settings blockEntity={blockEntity} updateEntity={updateEntity} />
        )}
      </div>

      <Table
        blockEntity={blockEntity}
        updateEntity={updateEntity}
        readonly={readonly}
      />
    </div>
  );
};
