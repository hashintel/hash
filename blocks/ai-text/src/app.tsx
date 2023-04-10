import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { AiAssistantMessage } from "@hashintel/block-design-system";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";

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
        /**
         * @todo: use a combination of paragraph and code blocks
         * to render the text in the EA
         */
        <AiAssistantMessage
          messageContent={textContent}
          disableEntranceAnimation
        />
      ) : !readonly ? (
        <GenerateText blockEntity={rootEntity} />
      ) : null}
    </ThemeProvider>
  );
};
