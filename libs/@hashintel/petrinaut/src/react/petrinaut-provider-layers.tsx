import { ExecutionFrameProvider } from "./execution-frame/provider";
import { PetrinautInstanceContext } from "./instance-context";
import {
  NetManagementContext,
  type NetManagement,
} from "./net-management-context";
import { PlaybackProvider } from "./playback/provider";
import { SDCPNProvider } from "./sdcpn-provider";
import { ActiveNetProvider } from "./state/active-net-provider";
import { CanvasViewportProvider } from "./state/canvas-viewport-provider";
import { EditorProvider } from "./state/editor-provider";
import { UndoRedoContext } from "./state/undo-redo-context";
import { UserSettingsProvider } from "./state/user-settings-provider";
import { useHandleHistoryAsUndoRedo } from "./use-handle-history-as-undo-redo";

import type { Petrinaut } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

export type PetrinautDocumentProviderProps = {
  children: ReactNode;
  instance: Petrinaut;
  netManagement: NetManagement;
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
  );

  const document = (
    <UserSettingsProvider>
      <SDCPNProvider>{children}</SDCPNProvider>
    </UserSettingsProvider>
  );

  return (
    <PetrinautInstanceContext value={instance}>
      <NetManagementContext value={netManagement}>
        {handleHistoryUndoRedo ? (
          <UndoRedoContext value={handleHistoryUndoRedo}>
            {document}
          </UndoRedoContext>
        ) : (
          document
        )}
      </NetManagementContext>
    </PetrinautInstanceContext>
  );
};

export type PetrinautCanvasProviderProps = {
  children: ReactNode;
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
> = ({ children }) => (
  <CanvasViewportProvider>
    <PlaybackProvider>
      <ActiveNetProvider>
        <EditorProvider>
          <ExecutionFrameProvider>{children}</ExecutionFrameProvider>
        </EditorProvider>
      </ActiveNetProvider>
    </PlaybackProvider>
  </CanvasViewportProvider>
);
