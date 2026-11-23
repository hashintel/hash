import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import {
  type FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  createPetrinaut,
  sameRules,
  type PetrinautDocHandle,
  type Petrinaut as Instance,
  type LspWorkerFactory,
  type WorkerFactory,
  type MinimalNetMetadata,
  type PetrinautRules,
  type ResolveImport,
  type SDCPN,
  type SimulatorRegistration,
} from "@hashintel/petrinaut-core";

import { useCommandRegistry } from "../react/commands/command-registry";
import { CommandRegistryProvider } from "../react/commands/command-registry-provider";
import { PetrinautProvider } from "../react/petrinaut-provider";
import { OverlayHost } from "./components/overlay-host";
import { Stack } from "./components/stack";
import { MonacoProvider } from "./monaco/provider";
import { ResolvingOverlay } from "./petrinaut/resolving-overlay";
import { useHeldNetManagement } from "./petrinaut/use-held-net-management";
import { documentViewPlugin } from "./plugins/document-view-plugin";
import { fpsCounterPlugin } from "./plugins/fps-counter-plugin";
import { PetrinautPluginsProvider } from "./plugins/plugins-provider";
import { PetrinautPresentationProvider } from "./presentation/presentation-provider";
import { noSlots, PetrinautSlotsContext } from "./slots-context";
import { EditorView } from "./views/Editor/editor-view";

import type { PetrinautNavigationController } from "../react/navigation/navigation";
import type { PetrinautPlugin } from "./plugins/define-petrinaut-plugin";
import type { PetrinautPresentationProfile } from "./presentation/presentation-context";
import type { PetrinautSlots } from "./types/petrinaut-slots";

// `clip`, not `hidden`: a hidden-overflow box is still programmatically
// scrollable, and focusing an element the canvas transform pushed past the
// edge (a value editor opening) scrolled the whole app sideways with no
// way back. `clip` forbids all scrolling of the box.
const editorRootStyle = css({
  position: "relative",
  height: "full",
  overflow: "clip",
  backgroundColor: "neutral.s25",
});

export type PetrinautProps = {
  handle: PetrinautDocHandle;
  /**
   * The plugins that add buttons, top-bar items, settings and UI to the
   * editor. Define each at module scope: a plugin created during render
   * remounts on every render.
   */
  plugins?: readonly PetrinautPlugin[];
  title?: string;
  setTitle?: (title: string) => void;
  readonly?: boolean;
  /**
   * Resolves an import of the document to its library: a promise of the
   * whole library, the library itself when it is in memory, or `undefined`
   * for one the host does not know. Keep it the same function from one
   * render to the next, at module scope for instance: a new one creates a
   * new editor instance, which resolves every import again.
   */
  resolveImport?: ResolveImport;
  /**
   * The ids of the libraries on offer. Each is resolved through
   * `resolveImport`, and its components are listed in the Components panel
   * to place instances of. The panel shows once the user switches Net
   * Components on, or where `rules` keep the editor to composing. Define the
   * list at module scope.
   */
  libraries?: readonly string[];
  /**
   * What the host lets the editor do: everything, when left out.
   * `{ edit: "compose" }` keeps it to composing the components of
   * `libraries`: the user places instances of them, wires their ports and
   * arranges the canvas. The tools that draw a net, the Definitions view and
   * the simulator are not offered, and Core refuses every other change to
   * the document. The rules are read by what they say, so an object written
   * inline is fine.
   */
  rules?: PetrinautRules;
  /**
   * Controls visibility of net-management UI in the editor's top bar and
   * burger menu.
   *
   * - [omitted] (default): show the title, include the "New", "Open", "Import",
   *   and "Load example" menu items in the burger menu.
   * - `"except-title"`: hide the management menu items but keep the title
   *   viewable and editable in the top bar.
   * - `"all"`: hide the title and all net-management menu items.
   */
  hideNetManagementControls?: "all" | "except-title";
  existingNets?: MinimalNetMetadata[];
  createNewNet?: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet?: (petriNetId: string) => void;
  /**
   * Host-supplied components to inject at specific locations in the editor.
   */
  slots?: PetrinautSlots;
  /**
   * Optional factory for the worker a Quick Simulation's run is stepped in:
   * the event simulation worker of
   * `@hashintel/petrinaut-core/workers/event-simulation`. Provide this when
   * the host bundler needs to own worker instantiation (e.g. when consuming
   * the published dist) — typically via Vite's `?worker` directive against
   * your own copy of the worker entry. When omitted, falls back to the
   * bundled inlined-blob worker that ships with the library, which works
   * for source-built consumers (storybook, dev) but not always for
   * production dist consumers.
   */
  eventSimulationWorkerFactory?: WorkerFactory;
  /**
   * Optional Monte Carlo worker factory. Hosts can provide this when they need
   * to own worker bundling for the Experiments tab.
   */
  monteCarloWorkerFactory?: WorkerFactory;
  /**
   * Simulators the host adds to the built-in ones, for Quick Simulation,
   * Stochastic mode and experiments alike. Define them at module scope.
   */
  simulators?: readonly SimulatorRegistration[];
  /**
   * Optional language-server worker factory. Same intent as
   * `eventSimulationWorkerFactory` — host-supplied LSP worker, typically via
   * `?worker` against the host's own copy of the worker source.
   */
  lspWorkerFactory?: LspWorkerFactory;
  /** Optional host-controlled, router-neutral app location. */
  navigation?: PetrinautNavigationController;
  /**
   * Presentation policy for the full editor. `review` keeps the full editor
   * surface while suppressing authoring actions for route-scoped read-only
   * examples. The default remains `editor`.
   */
  presentationProfile?: Exclude<PetrinautPresentationProfile, "preview">;
};

const noop = () => {};
const noPlugins: readonly PetrinautPlugin[] = [];
const noRules: PetrinautRules = {};
const noNets: MinimalNetMetadata[] = [];

/**
 * Handle-driven entry point. Creates a Core {@link Instance} from the given
 * handle, mounts {@link PetrinautProvider} to connect every bridge, and renders
 * the editor.
 *
 * Net-management concerns (title, switching) are passed alongside the handle
 * because they're not part of Core — they live in the host app.
 */
export const Petrinaut: FunctionComponent<PetrinautProps> = ({
  handle,
  plugins = noPlugins,
  title = "Untitled",
  setTitle,
  readonly = false,
  resolveImport,
  libraries,
  rules = noRules,
  hideNetManagementControls,
  existingNets = noNets,
  createNewNet = noop,
  loadPetriNet = noop,
  slots,
  eventSimulationWorkerFactory,
  monteCarloWorkerFactory,
  simulators,
  lspWorkerFactory,
  navigation,
  presentationProfile = "editor",
}) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  // Held for as long as the rules say the same: `rules={{ edit: "compose" }}`
  // is a new object on every render, and must not create a new instance.
  const [heldRules, setHeldRules] = useState(rules);
  if (!sameRules(heldRules, rules)) {
    setHeldRules(rules);
  }
  // `useMemo`: one instance per set of inputs is a requirement, not an
  // optimisation left to the compiler.
  const instance = useMemo<Instance>(
    () =>
      createPetrinaut({
        document: handle,
        readonly,
        resolveImport,
        libraries,
        rules: heldRules,
      }),
    [handle, readonly, resolveImport, libraries, heldRules],
  );

  useEffect(() => () => instance.dispose(), [instance]);

  const netManagement = useHeldNetManagement({
    title,
    setTitle,
    existingNets,
    createNewNet,
    loadPetriNet,
  });
  // Plugin buttons run commands; without a host registry they register in
  // the editor's own.
  const hostRegistry = useCommandRegistry();

  const editor = (
    <PortalContainerContext value={portalContainerRef}>
      <PetrinautProvider
        instance={instance}
        netManagement={netManagement}
        eventSimulationWorkerFactory={eventSimulationWorkerFactory}
        monteCarloWorkerFactory={monteCarloWorkerFactory}
        simulators={simulators}
        lspWorkerFactory={lspWorkerFactory}
        navigation={navigation}
      >
        <PetrinautPresentationProvider profile={presentationProfile}>
          <MonacoProvider>
            <Stack className={cx(editorRootStyle, "petrinaut-root")}>
              <PetrinautPluginsProvider
                plugins={[fpsCounterPlugin, documentViewPlugin, ...plugins]}
              >
                <EditorView
                  hideNetManagementControls={hideNetManagementControls}
                />
              </PetrinautPluginsProvider>
              <ResolvingOverlay />
              <OverlayHost ref={portalContainerRef} />
            </Stack>
          </MonacoProvider>
        </PetrinautPresentationProvider>
      </PetrinautProvider>
    </PortalContainerContext>
  );

  // The slots go around the editor, not into it: see `PetrinautSlotsContext`.
  return (
    <PetrinautSlotsContext value={slots ?? noSlots}>
      <CommandRegistryProvider registry={hostRegistry ?? undefined}>
        {editor}
      </CommandRegistryProvider>
    </PetrinautSlotsContext>
  );
};
