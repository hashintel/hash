import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "@xyflow/react/dist/style.css";
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

import { PetrinautProvider } from "../react/petrinaut-provider";
import { Stack } from "./components/stack";
import { MonacoProvider } from "./monaco/provider";
import { EditorView } from "./views/Editor/editor-view";

const editorRootStyle = css({
  position: "relative",
  height: "full",
  overflow: "hidden",
  backgroundColor: "neutral.s25",
});

const portalContainerStyle = css({
  position: "absolute",
  top: "0",
  left: "0",
  width: "full",
  height: "full",
  zIndex: "99999",
  pointerEvents: "none",
});

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
import type { PetrinautSlots } from "./types/petrinaut-slots";
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
  /**
   * When true (default), the first-visit product walkthrough auto-opens for
   * new users and the help (?) button is shown in the top bar. Set to false
   * to suppress both — useful when embedding Petrinaut inside a host that
   * provides its own onboarding.
   */
  showWalkthrough?: boolean;
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
  slots,
  simulationWorkerFactory,
  monteCarloWorkerFactory,
  lspWorkerFactory,
  showWalkthrough = true,
}) => {
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

  return (
    <PortalContainerContext value={portalContainerRef}>
      <PetrinautProvider
        instance={instance}
        netManagement={netManagement}
        simulationWorkerFactory={simulationWorkerFactory}
        monteCarloWorkerFactory={monteCarloWorkerFactory}
        lspWorkerFactory={lspWorkerFactory}
      >
        <MonacoProvider>
          <Stack className={cx(editorRootStyle, "petrinaut-root")}>
            <div ref={portalContainerRef} className={portalContainerStyle} />
            <EditorView
              aiAssistant={aiAssistant}
              hideNetManagementControls={hideNetManagementControls}
              slots={slots}
              viewportActions={viewportActions}
              showWalkthrough={showWalkthrough}
            />
          </Stack>
        </MonacoProvider>
      </PetrinautProvider>
    </PortalContainerContext>
  );
};
