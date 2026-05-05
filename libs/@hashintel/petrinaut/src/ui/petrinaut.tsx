import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "@xyflow/react/dist/style.css";
import "./index.css";

import { type FunctionComponent, useEffect, useMemo } from "react";

import type { PetrinautDocHandle } from "../core/handle";
import { createPetrinaut, type Petrinaut as Instance } from "../core/instance";
import type { LspWorkerFactory } from "../core/lsp/transport";
import type { WorkerFactory } from "../core/simulation";
import type { MinimalNetMetadata, SDCPN } from "../core/types/sdcpn";
import type { NetManagement } from "../react/net-management-context";
import { PetrinautProvider } from "../react/petrinaut-provider";
import type { ViewportAction } from "./types/viewport-action";
import { MonacoProvider } from "./monaco/provider";
import { EditorView } from "./views/Editor/editor-view";

export type PetrinautProps = {
  handle: PetrinautDocHandle;
  title?: string;
  setTitle?: (title: string) => void;
  readonly?: boolean;
  hideNetManagementControls?: boolean;
  existingNets?: MinimalNetMetadata[];
  createNewNet?: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet?: (petriNetId: string) => void;
  viewportActions?: ViewportAction[];
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
   * Optional language-server worker factory. Same intent as
   * `simulationWorkerFactory` — host-supplied LSP worker, typically via
   * `?worker` against the host's own copy of the worker source.
   */
  lspWorkerFactory?: LspWorkerFactory;
};

const noop = () => {};

/**
 * Handle-driven entry point. Creates a Core {@link Instance} from the given
 * handle, mounts {@link PetrinautProvider} to wire every bridge, and renders
 * the editor.
 *
 * Net-management concerns (title, switching) are passed alongside the handle
 * because they're not part of Core — they live in the host app.
 */
export const Petrinaut: FunctionComponent<PetrinautProps> = ({
  handle,
  title = "Untitled",
  setTitle = noop,
  readonly = false,
  hideNetManagementControls = true,
  existingNets = [],
  createNewNet = noop,
  loadPetriNet = noop,
  viewportActions,
  simulationWorkerFactory,
  lspWorkerFactory,
}) => {
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

  return (
    <PetrinautProvider
      instance={instance}
      netManagement={netManagement}
      simulationWorkerFactory={simulationWorkerFactory}
      lspWorkerFactory={lspWorkerFactory}
    >
      <MonacoProvider>
        <EditorView
          hideNetManagementControls={hideNetManagementControls}
          viewportActions={viewportActions}
        />
      </MonacoProvider>
    </PetrinautProvider>
  );
};
