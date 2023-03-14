import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";

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

  return (
    <ThemeProvider theme={theme}>
      {textContent ? (
        <ConfirmedText
          entityId={rootEntity.metadata.recordId.entityId}
          text={textContent}
        />
      ) : !readonly ? (
        <GenerateText blockEntity={rootEntity} />
      ) : null}
    </ThemeProvider>
  );
};
