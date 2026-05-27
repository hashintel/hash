import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { type FunctionComponent, useEffect, useMemo } from "react";

import {
  createPetrinaut,
  type PetrinautDocHandle,
  type Petrinaut as Instance,
  type LspWorkerFactory,
  type WorkerFactory,
  type MinimalNetMetadata,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautProvider } from "../react/petrinaut-provider";
import { MonacoProvider } from "./monaco/provider";
import { EditorView } from "./views/Editor/editor-view";

import type { EvalSandbox } from "../react/eval-sandbox/interface";
import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./views/Editor/panels/ai-assistant-panel";

export type PetrinautAiChatTransport = PetrinautAiTransport;

export type PetrinautAiAssistant = {
  messages?: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onMessages?: (messages: PetrinautAiMessage[]) => void;
  transport: PetrinautAiTransport;
};

import type { NetManagement } from "../react/net-management-context";
import type { ViewportAction } from "./types/viewport-action";

export type PetrinautProps = {
  handle: PetrinautDocHandle;
  title?: string;
  setTitle?: (title: string) => void;
  readonly?: boolean;
  hideNetManagementControls?: boolean;
  existingNets?: MinimalNetMetadata[];
  createNewNet?: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  loadPetriNet?: (petriNetId: string) => void;
  aiAssistant?: PetrinautAiAssistant;
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
  /**
   * Optional {@link EvalSandbox} owning all user-code evaluation. When
   * omitted, the editor uses an inline (in-realm) sandbox — identical
   * to behavior before the sandbox abstraction was added. Pass
   * `createIframeSandbox({ src })` from
   * `@hashintel/petrinaut/sandbox-iframe` to isolate user code in a
   * sandboxed iframe (recommended for production hosts).
   *
   * When provided, the `simulationWorkerFactory` /
   * `monteCarloWorkerFactory` props are ignored — the sandbox owns its
   * own workers.
   */
  evalSandbox?: EvalSandbox;
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
  aiAssistant,
  viewportActions,
  simulationWorkerFactory,
  monteCarloWorkerFactory,
  lspWorkerFactory,
  evalSandbox,
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
      monteCarloWorkerFactory={monteCarloWorkerFactory}
      lspWorkerFactory={lspWorkerFactory}
      evalSandbox={evalSandbox}
    >
      <MonacoProvider>
        <EditorView
          aiAssistant={aiAssistant}
          hideNetManagementControls={hideNetManagementControls}
          viewportActions={viewportActions}
        />
      </MonacoProvider>
    </PetrinautProvider>
  );
};
