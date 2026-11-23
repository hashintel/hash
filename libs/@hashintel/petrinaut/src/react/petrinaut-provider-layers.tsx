import { composesOnly, resolvedLibraries } from "@hashintel/petrinaut-core";

import { ActiveNetProvider } from "./document/active-net-provider";
import { CompositionContext } from "./document/composition-context";
import { PetrinautInstanceContext } from "./document/instance-context";
import { SDCPNProvider } from "./document/sdcpn-provider";
import { UndoRedoContext } from "./document/undo-redo-context";
import { useHandleHistoryAsUndoRedo } from "./document/use-handle-history-as-undo-redo";
import { EventPlaybackProvider } from "./event-playback/provider";
import { ExecutionFrameProvider } from "./execution-frame/provider";
import {
  NetManagementContext,
  type NetManagement,
} from "./host/net-management-context";
import { ReadOnlyActionContext } from "./host/read-only-action-context";
import { useStore } from "./shared/use-store";
import { CanvasViewportProvider } from "./state/canvas-viewport-provider";
import { EditorProvider } from "./state/editor-provider";
import { PanelSizesProvider } from "./state/panel-sizes-provider";
import { UserSettingsProvider } from "./state/user-settings-provider";

import type { Petrinaut, PlaybackSpeed } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

export type PetrinautDocumentProviderProps = {
  children: ReactNode;
  instance: Petrinaut;
  netManagement: NetManagement;
};

/**
 * Publishes the state of the document's imports and the host's rules, as the
 * Core instance holds them.
 */
const CompositionProvider: React.FC<{
  children: ReactNode;
  instance: Petrinaut;
}> = ({ children, instance }) => {
  const imports = useStore(instance.imports);
  return (
    <CompositionContext
      value={{
        imports,
        libraries: resolvedLibraries(imports),
        offered: instance.libraries,
        rules: instance.rules,
      }}
    >
      {children}
    </CompositionContext>
  );
};

/**
 * The document bridge shared by the full editor and lightweight Preview.
 * It deliberately contains no workers. User settings live here so every host
 * mounts them once, above a simulation provider that reads the Ad-hoc
 * scenarios setting.
 */
export const PetrinautDocumentProvider: React.FC<
  PetrinautDocumentProviderProps
> = ({ children, instance, netManagement }) => {
  const handleHistoryUndoRedo = useHandleHistoryAsUndoRedo(
    instance.handle.history,
    { sinceTaken: composesOnly(instance.rules) },
  );

  return (
    <PetrinautInstanceContext value={instance}>
      <NetManagementContext value={netManagement}>
        <ReadOnlyActionContext value={netManagement.readOnlyAction}>
          <UndoRedoContext value={handleHistoryUndoRedo ?? null}>
            <UserSettingsProvider>
              <CompositionProvider instance={instance}>
                <SDCPNProvider>{children}</SDCPNProvider>
              </CompositionProvider>
            </UserSettingsProvider>
          </UndoRedoContext>
        </ReadOnlyActionContext>
      </NetManagementContext>
    </PetrinautInstanceContext>
  );
};

export type PetrinautCanvasProviderProps = {
  children: ReactNode;
  initialPlaybackSpeed?: PlaybackSpeed;
};

/**
 * Runtime contexts needed by the existing SDCPN canvas. It consumes the
 * nearest simulation context when one is mounted and otherwise uses the
 * inert default, which keeps the read-only Preview free of simulation workers.
 *
 * The per-net viewport lives here rather than in the document layer: the
 * canvas is its only consumer, and mounting it here gives the Preview the
 * same remembered framing as the editor.
 */
export const PetrinautCanvasProvider: React.FC<
  PetrinautCanvasProviderProps
> = ({ children, initialPlaybackSpeed }) => (
  <CanvasViewportProvider>
    <EventPlaybackProvider initialSpeed={initialPlaybackSpeed}>
      <ActiveNetProvider>
        <PanelSizesProvider>
          <EditorProvider>
            <ExecutionFrameProvider>{children}</ExecutionFrameProvider>
          </EditorProvider>
        </PanelSizesProvider>
      </ActiveNetProvider>
    </EventPlaybackProvider>
  </CanvasViewportProvider>
);
