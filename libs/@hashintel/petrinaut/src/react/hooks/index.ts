// Public hook surface for `@hashintel/petrinaut/react`.
//
// Each hook reads from an existing React context (SDCPN, Simulation, Playback,
// LanguageClient) and returns a narrow, typed slice. Phase 3a — these wrap
// today's contexts; Phase 3b will collapse the providers under a single
// <PetrinautProvider> sourcing data from the Petrinaut instance directly.

export {
  useDocumentId,
  useDocumentState,
  useIsDocumentReady,
  useMutate,
  usePetrinautDefinition,
  usePetrinautDefinitionSelector,
  usePetrinautPatches,
  useSetTitle,
  useTitle,
} from "./use-document";

export {
  useGetSimulationFrame,
  useSimulationActions,
  useSimulationError,
  useSimulationFrameCount,
  useSimulationParameters,
  useSimulationStatus,
  type SimulationActionsBundle,
  type SimulationFrame,
  type SimulationFrameState,
  type SimulationState,
} from "./use-simulation";

export {
  useCurrentFrame,
  useCurrentViewedFrame,
  useIsComputeAvailable,
  useIsViewOnlyAvailable,
  usePlaybackActions,
  usePlaybackFrameIndex,
  usePlaybackMode,
  usePlaybackSpeed,
  usePlaybackState,
  type PlaybackActionsBundle,
  type PlaybackSpeed,
  type PlaybackState,
  type PlayMode,
} from "./use-playback";

export {
  useDiagnostics,
  useDiagnosticsForUri,
  useLspActions,
  useTotalDiagnosticsCount,
  type LspActionsBundle,
} from "./use-lsp";

// Re-export the existing read-only hook from its current location.
export { useIsReadOnly } from "../../state/use-is-read-only";

// Re-export the notifications hook.
export { useNotifications } from "../../notifications/notifications-context";

// Instance access + low-level store adapter.
export { usePetrinautInstance } from "../use-petrinaut-instance";
export { useStore, useStoreSelector } from "../use-store";
