import { MultiFilter } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { EditableField, theme } from "@hashintel/block-design-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { Box, ThemeProvider } from "@mui/material";
import { useCallback, useMemo, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { SizeMe } from "react-sizeme";

import { RootKey } from "./additional-types";
import styles from "./base.module.scss";
import { SettingsBar } from "./components/settings-bar/settings-bar";
import { Table } from "./components/table/table";
import { TableWithQuery } from "./components/table/table-with-query";
import { WelcomeModal } from "./components/welcome-modal";
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

  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    BlockEntity,
    TableBlockOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const linkedQueryEntity = linkedEntities[0]?.rightEntity;

  const linkedQuery = linkedQueryEntity?.properties[
    "https://blockprotocol.org/@hash/types/property-type/query/"
  ] as MultiFilter | undefined;

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

  const hasLinkedQuery = !!linkedQuery;

  const isLocalTableEmpty = useMemo(() => {
    const { tableLocalColumn, tableLocalRow } = simplifyProperties(
      blockEntity.properties,
    );

    return (
      (!tableLocalColumn || tableLocalColumn.length === 0) &&
      (!tableLocalRow || tableLocalRow.length === 0)
    );
  }, [blockEntity]);

  const [isUsingLocalTable, setIsUsingLocalTable] =
    useState(!isLocalTableEmpty);

  if (!isUsingLocalTable && !isLocalTableEmpty) {
    setIsUsingLocalTable(true);
  }

  const isWelcomeModalOpen =
    !hasLinkedQuery && !isUsingLocalTable && isLocalTableEmpty;

  const handleJustStartTypingClick = useCallback(() => {
    setIsUsingLocalTable(true);
  }, []);

  const handleLoadExistingEntitiesClick = useCallback(() => {
    void graphModule.requestLinkedQuery();
  }, [graphModule]);

  return (
    <ThemeProvider theme={theme}>
      <SizeMe>
        {({ size }) => {
          const collapseSettings = (size.width ?? 0) < 670;

          return (
            <Box
              className={styles.block}
              ref={blockRootRef}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              sx={{
                position: "relative",
              }}
            >
              <WelcomeModal
                onJustStartTypingClick={handleJustStartTypingClick}
                onLoadExistingEntitiesClick={handleLoadExistingEntitiesClick}
                open={isWelcomeModalOpen}
                container={blockRootRef.current}
              />
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
                    placeholder="Untitled Table"
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

              {hasLinkedQuery ? (
                <TableWithQuery
                  graphModule={graphModule}
                  query={linkedQuery}
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
            </Box>
          );
        }}
      </SizeMe>
    </ThemeProvider>
  );
};
