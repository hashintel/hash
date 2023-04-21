import {
  type BlockComponent,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/design-system/src/entity-query-editor/entity-query-editor";
import { ThemeProvider } from "@mui/material";
import { useRef } from "react";

import styles from "./base.module.scss";
import { BlockEntity } from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = () => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  return (
    <ThemeProvider theme={theme}>
      <div className={styles.block} ref={blockRootRef}>
        <div style={{ padding: 24, border: "1px solid black" }}>
          <EntityQueryEditor
            onClose={() => alert("closed")}
            onSave={() => alert("saved")}
          />
        </div>
      </div>
    </ThemeProvider>
  );
};
