import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { EditableField, theme } from "@hashintel/block-design-system";
import { ThemeProvider } from "@mui/material";
import { useMemo, useRef, useState } from "react";

import type { BlockEntityKey } from "./additional-types";
import styles from "./base.module.scss";
import { Board } from "./components/board/board";
import type {
  BlockEntity,
  KanbanBoardBlockOutgoingLinkAndTarget,
} from "./types/generated/block-entity";

const titleKey: BlockEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    BlockEntity,
    KanbanBoardBlockOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId: blockEntityId },
      entityTypeId: blockEntityTypeId,
    },
    properties: { [titleKey]: title = "" },
  } = blockEntity;

  const updateEntity = useMemo(
    () => async (newProperties: BlockEntity["properties"]) => {
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

  const [titleValue, setTitleValue] = useState(title);

  return (
    <ThemeProvider theme={theme}>
      <div className={styles.block} ref={blockRootRef}>
        <EditableField
          value={titleValue}
          placeholder="Untitled Board"
          onChange={(event) => setTitleValue(event.target.value)}
          onBlur={(event) => updateEntity({ [titleKey]: event.target.value })}
          readonly={readonly}
          sx={{
            fontWeight: 700,
            fontSize: "21px !important",
            lineHeight: "1.2 !important",
            color: "black",
          }}
          wrapperSx={{ mb: 1.5 }}
        />

        <Board
          updateEntity={updateEntity}
          blockEntity={blockEntity}
          readonly={readonly}
        />
      </div>
    </ThemeProvider>
  );
};
