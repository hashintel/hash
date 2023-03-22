import { Entity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";

/** @todo: generate this somehow */
type RootEntity = Entity<{}>;

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly: _readonly },
}) => {
  const { rootEntity: _rootEntity } = useEntitySubgraph(blockEntitySubgraph);

  return <ThemeProvider theme={theme}>Hello World!</ThemeProvider>;
};
