import { useEffect, useMemo } from "react";

import {
  getLatestNetDefinitionToolName,
  normalizePetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import {
  crewReservationConversationId,
  crewReservationFixtureClientToolNames,
} from "./prepared-crew-reservation-fixture";
import { workpieceForCrewReservationBundle } from "./resolve-crew-reservation-bundle";
import { useCrewReservationSettlement } from "./use-crew-reservation-settled-manifest";
import { usePrepareCrewReservationConversation } from "./use-prepare-crew-reservation-conversation";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { CrewReservationSettledManifest } from "./crew-reservation-settled-manifest";
import type { FlueClient } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";

const clientToolNames: ReadonlySet<string> = new Set(
  crewReservationFixtureClientToolNames,
);

export const crewReservationFixtureConfiguration = {
  clientToolNames,
  conversationId: crewReservationConversationId,
  mapClientToolInput: ({
    input,
    toolName,
  }: {
    readonly input: unknown;
    readonly toolName: string;
  }) =>
    toolName === "addArc" || toolName === getLatestNetDefinitionToolName
      ? normalizePetrinautAiToolInput(toolName, input)
      : input,
} as const;

export const useCrewReservationFixtureSession = (input: {
  readonly clientPromise: Promise<FlueClient> | null;
  readonly definition: SDCPN | undefined;
  readonly enabled: boolean;
  readonly history: CrewReservationHistory | undefined;
  readonly historyError: string | undefined;
  readonly persistCoherentSnapshot: (sha256: string, definition: SDCPN) => void;
  readonly refreshHistory: () => void;
  readonly setSettledManifest: (
    value:
      | CrewReservationSettledManifest
      | null
      | ((
          previous: CrewReservationSettledManifest | null,
        ) => CrewReservationSettledManifest | null),
  ) => void;
  readonly settledManifest: CrewReservationSettledManifest | null;
  readonly snapshotMissing: boolean;
}) => {
  const {
    clientPromise,
    definition,
    enabled,
    history,
    historyError,
    persistCoherentSnapshot,
    refreshHistory,
    setSettledManifest,
    settledManifest,
    snapshotMissing,
  } = input;
  const preparation = usePrepareCrewReservationConversation(
    clientPromise,
    enabled,
  );
  const preparationStatus = preparation.status;

  useEffect(() => {
    if (
      preparationStatus.state === "ready" ||
      preparationStatus.state === "failed"
    ) {
      refreshHistory();
    }
  }, [preparationStatus.state, refreshHistory]);

  const settlementStatus = useCrewReservationSettlement({
    definition: enabled ? definition : undefined,
    enabled,
    history: enabled ? history : undefined,
    historyError: enabled ? historyError : undefined,
    persistCoherentSnapshot,
    preparationError:
      preparationStatus.state === "failed"
        ? preparationStatus.error
        : undefined,
    setSettledManifest,
    settledManifest,
    snapshotMissing,
  });

  const currentWorkpiece = useMemo(() => {
    try {
      return workpieceForCrewReservationBundle(history, settledManifest);
    } catch {
      return undefined;
    }
  }, [history, settledManifest]);

  return {
    currentWorkpiece,
    preparationStatus,
    settlementStatus,
    transportClientPromise: preparation.clientPromise,
    transportUnavailableReason:
      preparationStatus.state === "failed"
        ? preparationStatus.error
        : "The prepared fixture conversation is still being prepared.",
  };
};
