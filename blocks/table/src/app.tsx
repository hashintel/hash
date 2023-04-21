import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { EditableField, theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";
import { useRef, useState } from "react";

import { RootKey } from "./additional-types";
import styles from "./base.module.scss";
import { Settings } from "./components/settings/settings";
import { Table } from "./components/table/table";
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

  const [titleValue, setTitleValue] = useState(title);

  return (
    <ThemeProvider theme={theme}>
      <div className={styles.block} ref={blockRootRef}>
        <div className={styles.titleWrapper}>
          <div>
            <EditableField
              value={titleValue}
              placeholder="Untitled Board"
              onChange={(event) => setTitleValue(event.target.value)}
              onBlur={(event) =>
                updateEntity({ [titleKey]: event.target.value })
              }
              readonly={readonly}
              sx={{
                fontWeight: 700,
                fontSize: "21px !important",
                lineHeight: "1.2 !important",
                color: "black",
              }}
              wrapperSx={{ mb: 1.5 }}
            />
          </div>
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
    </ThemeProvider>
  );
};
