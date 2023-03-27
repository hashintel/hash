import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";

import { CompleteChat } from "./complete-chat";
import { AIChatBlock } from "./types/generated/block-entity";

export const App: BlockComponent<AIChatBlock> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity: aiChatBlockEntity } =
    useEntitySubgraph(blockEntitySubgraph);

  return (
    <ThemeProvider theme={theme}>
      {readonly ? (
        <>READONLY</>
      ) : (
        <CompleteChat aiChatBlockEntity={aiChatBlockEntity} />
      )}
    </ThemeProvider>
  );
};
