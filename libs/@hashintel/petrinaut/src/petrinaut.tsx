import "reactflow/dist/style.css";
import "./index.css";

import { useMonacoGlobalTypings } from "./hooks/use-monaco-global-typings";
import { EditorProvider } from "./state/editor-provider";
import { SDCPNProvider } from "./state/sdcpn-provider";
import { SimulationProvider } from "./state/simulation-provider";
import { EditorView } from "./views/Editor/editor-view";

/**
 * Internal component to initialize Monaco global typings.
 * Must be inside SDCPNProvider to access the store.
 */
const MonacoSetup: React.FC = () => {
  useMonacoGlobalTypings();
  return null;
};

export const Petrinaut: React.FC = () => {
  return (
    <SDCPNProvider>
      <EditorProvider>
        <SimulationProvider>
          <MonacoSetup />
          <EditorView />
        </SimulationProvider>
      </EditorProvider>
    </SDCPNProvider>
  );
};
