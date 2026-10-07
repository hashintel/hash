import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { type FunctionComponent, useEffect, useMemo, useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  createPetrinaut,
  type PetrinautDocHandle,
  type Petrinaut as Instance,
  type LspWorkerFactory,
  type WorkerFactory,
  type MinimalNetMetadata,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "../react/commands/command-registry";
import { PetrinautProvider } from "../react/petrinaut-provider";
import { Stack } from "./components/stack";
import { MonacoProvider } from "./monaco/provider";
import { PetrinautPluginsProvider } from "./plugins/plugins-provider";
import { EditorView } from "./views/Editor/editor-view";
import {
  PetrinautPresentationProvider,
  type PetrinautPresentationProfile,
} from "./views/shared/presentation-context";

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

import type { PetrinautNavigationController } from "../react/navigation";
import type { NetManagement } from "../react/net-management-context";
import type { PetrinautPlugin } from "./plugins/define-petrinaut-plugin";
import type { PetrinautSlots } from "./types/petrinaut-slots";

export type PetrinautProps = {
  handle: PetrinautDocHandle;
  /**
   * The plugins that add buttons, top-bar items, settings, assistants and
   * UI to the editor. Define each at module scope: a plugin created during
   * render remounts on every render.
   */
  plugins?: readonly PetrinautPlugin[];
  title?: string;
  setTitle?: (title: string) => void;
  readonly?: boolean;
  /**
   * Controls visibility of net-management UI in the editor's top bar and
   * burger menu.
   *
   * - [omitted] (default): show the title, includethe "New", "Open", "Import",
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
   * Optional simulation-worker factory. Provide this when the host bundler
   * needs to own worker instantiation (e.g. when consuming the published
   * dist) — typically via Vite's `?worker` directive against your own copy
   * of the worker entry. When omitted, falls back to the bundled
   * inlined-blob worker that ships with the library, which works for
   * source-built consumers (storybook, dev) but not always for production
   * dist consumers.
   */
  simulationWorkerFactory?: WorkerFactory;
  /**
   * Optional Monte Carlo worker factory. Hosts can provide this when they need
   * to own worker bundling for the Experiments tab.
   */
  monteCarloWorkerFactory?: WorkerFactory;
  /**
   * Optional language-server worker factory. Same intent as
   * `simulationWorkerFactory` — host-supplied LSP worker, typically via
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
  hideNetManagementControls,
  existingNets = [],
  createNewNet = noop,
  loadPetriNet = noop,
  slots,
  simulationWorkerFactory,
  monteCarloWorkerFactory,
  lspWorkerFactory,
  navigation,
  presentationProfile = "editor",
}) => {
  const titleEditable = setTitle !== undefined;
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const instance = useMemo<Instance>(
    () => createPetrinaut({ document: handle, readonly }),
    [handle, readonly],
  );

  useEffect(() => () => instance.dispose(), [instance]);

  const netManagement: NetManagement = {
    title,
    setTitle,
    existingNets,
    createNewNet,
    loadPetriNet,
  };
  // Plugin buttons run commands; without a host registry they register in
  // the editor's own.
  const hostRegistry = useCommandRegistry();

  const editor = (
    <PortalContainerContext value={portalContainerRef}>
      <PetrinautProvider
        instance={instance}
        netManagement={netManagement}
        simulationWorkerFactory={simulationWorkerFactory}
        monteCarloWorkerFactory={monteCarloWorkerFactory}
        lspWorkerFactory={lspWorkerFactory}
        navigation={navigation}
      >
        <PetrinautPresentationProvider profile={presentationProfile}>
          <MonacoProvider>
            <Stack
              className={cx(editorRootStyle, "petrinaut-root")}
              ref={portalContainerRef}
            >
              <PetrinautPluginsProvider plugins={plugins}>
                <EditorView
                  hideNetManagementControls={hideNetManagementControls}
                  slots={slots}
                  titleEditable={titleEditable}
                />
              </PetrinautPluginsProvider>
            </Stack>
          </MonacoProvider>
        </PetrinautPresentationProvider>
      </PetrinautProvider>
    </PortalContainerContext>
  );

  return (
    <CommandRegistryProvider registry={hostRegistry ?? undefined}>
      {editor}
    </CommandRegistryProvider>
  );
};
