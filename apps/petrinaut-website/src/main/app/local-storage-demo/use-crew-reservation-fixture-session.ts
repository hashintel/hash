import { useEffect, useMemo } from "react";

import {
  getLatestNetDefinitionToolName,
  normalizePetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import { brunchClientToolNames } from "./brunch-client-tools";
import { useFixtureDocumentSessionState } from "./documents/local-storage/fixture-document-session-state";
import {
  crewReservationConversationId,
  crewReservationFixtureClientToolNames,
} from "./prepared-crew-reservation-fixture";
import { workpieceForCrewReservationBundle } from "./resolve-crew-reservation-bundle";
import { useCrewReservationSettlement } from "./use-crew-reservation-settled-manifest";
import { usePrepareCrewReservationConversation } from "./use-prepare-crew-reservation-conversation";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { DocumentRepository } from "./documents/document-repository";
import type { FlueClient } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";

/**
 * The fixture adds its canonical Petrinaut read and least mutation to the
 * browser catalog rather than replacing it: the SDCPN plugin mounts the docs
 * reader in every mode, so a docs read must still be answered here or the
 * turn stalls awaiting a client result that never comes.
 */
const clientToolNames: ReadonlySet<string> = new Set([
  ...brunchClientToolNames,
  ...crewReservationFixtureClientToolNames,
]);

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
  readonly refreshHistory: () => void;
  readonly repository: DocumentRepository;
}) => {
  const {
    clientPromise,
    definition,
    enabled,
    history,
    historyError,
    refreshHistory,
    repository,
  } = input;
  const fixtureState = useFixtureDocumentSessionState(repository);
  const settledManifest = fixtureState?.settledManifest ?? null;
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
    persistCoherentSnapshot:
      fixtureState?.persistCoherentSnapshot ?? (() => undefined),
    preparationError:
      preparationStatus.state === "failed"
        ? preparationStatus.error
        : undefined,
    setSettledManifest: fixtureState?.setSettledManifest ?? (() => undefined),
    settledManifest,
    snapshotMissing: fixtureState?.snapshotMissing ?? false,
  });

  const currentWorkpiece = useMemo(() => {
    try {
      return workpieceForCrewReservationBundle(history, settledManifest);
    } catch {
      return undefined;
    }
  }, [history, settledManifest]);

  return {
    bundle:
      settledManifest === null
        ? null
        : {
            revision: settledManifest.revision,
            targetArc: settledManifest.document.targetArc,
          },
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
