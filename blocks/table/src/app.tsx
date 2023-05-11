import { MultiFilter } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { EditableField, theme } from "@hashintel/block-design-system";
import { ThemeProvider } from "@mui/material";
import { useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { SizeMe } from "react-sizeme";

import { RootKey } from "./additional-types";
import styles from "./base.module.scss";
import { SettingsBar } from "./components/settings-bar/settings-bar";
import { Table } from "./components/table/table";
import { TableWithQuery } from "./components/table/table-with-query";
import {
  BlockEntity,
  TableBlockOutgoingLinkAndTarget,
} from "./types/generated/block-entity";

const titleKey: RootKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";

const query: MultiFilter = {
  filters: [
    {
      field: ["metadata", "entityTypeId"],
      operator: "EQUALS",
      value: "https://example.com/types/entity-type/person/v/1",
    },
  ],
  operator: "OR",
};

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

  const [hovered, setHovered] = useState(false);
  const [titleValue, setTitleValue] = useState(title);

  return (
    <ThemeProvider theme={theme}>
      <SizeMe>
        {({ size }) => {
          const collapseSettings = (size.width ?? 0) < 670;

          return (
            <div
              className={styles.block}
              ref={blockRootRef}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              {!readonly ? (
                <SettingsBar
                  show={isMobile || hovered}
                  collapseSettings={collapseSettings}
                  blockEntity={blockEntity}
                  updateEntity={updateEntity}
                />
              ) : null}
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
              </div>

              {query ? (
                <TableWithQuery
                  graphModule={graphModule}
                  query={query}
                  blockEntity={blockEntity}
                  readonly={readonly}
                />
              ) : (
                <Table
                  blockEntity={blockEntity}
                  updateEntity={updateEntity}
                  readonly={readonly}
                />
              )}
            </div>
          );
        }}
      </SizeMe>
    </ThemeProvider>
  );
};
