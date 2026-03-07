import "@xyflow/react/dist/style.css";
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
import { LanguageClientProvider } from "./lsp/provider";
import { MonacoProvider } from "./monaco/provider";
import { NotificationsProvider } from "./notifications/notifications-provider";
import { PlaybackProvider } from "./playback/provider";
import { SimulationProvider } from "./simulation/provider";
import { EditorProvider } from "./state/editor-provider";
import { SDCPNProvider } from "./state/sdcpn-provider";
import {
  UndoRedoContext,
  type UndoRedoContextValue,
} from "./state/undo-redo-context";
import { UserSettingsProvider } from "./state/user-settings-provider";
import { EditorView } from "./views/Editor/editor-view";

export { isSDCPNEqual } from "./lib/deep-equal";

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

export type { UndoRedoContextValue as UndoRedoProps } from "./state/undo-redo-context";

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
  /**
   * Optional undo/redo support. When provided, the editor will show
   * undo/redo buttons in the top bar and register keyboard shortcuts.
   */
  undoRedo?: UndoRedoContextValue;
};

export const Petrinaut = ({
  hideNetManagementControls,
  undoRedo,
  ...rest
}: PetrinautProps) => {
  return (
    <NotificationsProvider>
      <UndoRedoContext value={undoRedo ?? null}>
        <SDCPNProvider {...rest}>
          <LanguageClientProvider key={rest.petriNetId}>
            <MonacoProvider>
              <SimulationProvider>
                <PlaybackProvider>
                  <UserSettingsProvider>
                    <EditorProvider>
                      <EditorView
                        hideNetManagementControls={hideNetManagementControls}
                      />
                    </EditorProvider>
                  </UserSettingsProvider>
                </PlaybackProvider>
              </SimulationProvider>
            </MonacoProvider>
          </LanguageClientProvider>
        </SDCPNProvider>
      </UndoRedoContext>
    </NotificationsProvider>
  );
};
