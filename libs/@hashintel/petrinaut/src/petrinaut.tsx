import "reactflow/dist/style.css";
import "./index.css";

import type {
  Color,
  DifferentialEquation,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "./core/types/sdcpn";
import { useMonacoGlobalTypings } from "./hooks/use-monaco-global-typings";
import { CheckerProvider } from "./state/checker-provider";
import { EditorProvider } from "./state/editor-provider";
import { SDCPNProvider } from "./state/sdcpn-provider";
import { SimulationProvider } from "./state/simulation-provider";
import { EditorView } from "./views/Editor/editor-view";

export type {
  Color,
  DifferentialEquation,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
};

/**
 * Internal component to initialize Monaco global typings.
 * Must be inside SDCPNProvider to access the store.
 */
const MonacoSetup: React.FC = () => {
  useMonacoGlobalTypings();
  return null;
};

export type PetrinautProps = {
  /**
   * Nets other than this one which are available for selection, e.g. to switch to or to link from a transition.
   */
  existingNets: MinimalNetMetadata[];
  /**
   * Create a new net and load it into the editor.
   */
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  /**
   * Whether to hide controls relating to net loading, creation and title.
   */
  hideNetManagementControls: boolean;
  /**
   * The ID of the net which is currently loaded.
   */
  petriNetId: string | null;
  /**
   * The definition of the net which is currently loaded.
   */
  petriNetDefinition: SDCPN;
  /**
   * Update the definition of the net which is currently loaded, by mutation.
   *
   * Should not return anything – the consumer of Petrinaut must pass mutationFn into an appropriate helper
   * which does something with the mutated object, e.g. `immer`'s `produce` or `@automerge/react`'s `changeDoc`.
   *
   * @example
   *   mutatePetriNetDefinition((petriNetDefinition) => {
   *     petriNetDefinition.nodes.push({
   *       id: "new-node",
   *       type: "place",
   *       position: { x: 0, y: 0 },
   *     });
   *   });
   *
   * @see https://immerjs.github.io/immer
   * @see https://automerge.org
   */
  mutatePetriNetDefinition: MutateSDCPN;
  /**
   * Load a new net by id.
   */
  loadPetriNet: (petriNetId: string) => void;
  /**
   * Whether the editor is readonly.
   */
  readonly: boolean;
  /**
   * Set the title of the net which is currently loaded.
   */
  setTitle: (title: string) => void;
  /**
   * The title of the net which is currently loaded.
   */
  title: string;
};

export const Petrinaut = ({
  hideNetManagementControls,
  ...rest
}: PetrinautProps) => {
  return (
    <SDCPNProvider {...rest}>
      <CheckerProvider>
        <SimulationProvider>
          <EditorProvider>
            <MonacoSetup />
            <EditorView hideNetManagementControls={hideNetManagementControls} />
          </EditorProvider>
        </SimulationProvider>
      </CheckerProvider>
    </SDCPNProvider>
  );
};
