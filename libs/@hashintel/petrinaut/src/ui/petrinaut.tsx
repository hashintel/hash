import { type FunctionComponent } from "react";

import type {
  Color,
  DifferentialEquation,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "../core/types/sdcpn";
import { useEphemeralHandle } from "../react/use-ephemeral-handle";
import {
  UndoRedoContext,
  type UndoRedoContextValue,
} from "../react/state/undo-redo-context";
import type { ViewportAction } from "../types/viewport-action";
import { PetrinautNext } from "./petrinaut-next";

export { isSDCPNEqual } from "../lib/deep-equal";

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

export type { UndoRedoContextValue as UndoRedoProps } from "../react/state/undo-redo-context";
export type { ViewportAction } from "../types/viewport-action";

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
  /**
   * Optional additional action buttons to render in the viewport controls panel,
   * after the built-in buttons.
   */
  viewportActions?: ViewportAction[];
};

/**
 * Prop-driven editor entry. Internally an adapter on top of {@link PetrinautNext}:
 * builds an ephemeral {@link PetrinautDocHandle} from the document props so the
 * editor flows through the standard handle-based pipeline, and wraps
 * `<PetrinautNext>` in an `<UndoRedoContext>` to honour the prop-supplied
 * `undoRedo` (which the new pipeline normally derives from `handle.history`,
 * absent here).
 *
 * Prefer {@link PetrinautNext} for new integrations.
 */
export const Petrinaut: FunctionComponent<PetrinautProps> = ({
  petriNetId,
  petriNetDefinition,
  mutatePetriNetDefinition,
  readonly,
  undoRedo,
  hideNetManagementControls,
  viewportActions,
  title,
  setTitle,
  existingNets,
  createNewNet,
  loadPetriNet,
}) => {
  const handle = useEphemeralHandle({
    petriNetId,
    petriNetDefinition,
    mutatePetriNetDefinition,
  });

  return (
    <UndoRedoContext value={undoRedo ?? null}>
      <PetrinautNext
        handle={handle}
        readonly={readonly}
        hideNetManagementControls={hideNetManagementControls}
        viewportActions={viewportActions}
        title={title}
        setTitle={setTitle}
        existingNets={existingNets}
        createNewNet={createNewNet}
        loadPetriNet={loadPetriNet}
      />
    </UndoRedoContext>
  );
};
