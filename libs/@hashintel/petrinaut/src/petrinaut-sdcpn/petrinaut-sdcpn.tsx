import "reactflow/dist/style.css";
import "./index.css";

import { EditorProvider } from "./state/editor-provider";
import { SDCPNProvider } from "./state/sdcpn-provider";
import { EditorView } from "./views/Editor/editor-view";

export const PetrinautSDCPN: React.FC = () => {
  return (
    <SDCPNProvider>
      <EditorProvider>
        <EditorView />
      </EditorProvider>
    </SDCPNProvider>
  );
};
