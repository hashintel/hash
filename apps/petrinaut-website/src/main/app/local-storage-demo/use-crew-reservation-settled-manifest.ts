import { useEffect, useState } from "react";

import {
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage,
} from "./browser-storage";
import {
  crewReservationSettledManifestStorageKey,
  parseCrewReservationSettledManifest,
  settleCrewReservationManifest,
  type CrewReservationSettledManifest,
  type CrewReservationSettlementResult,
} from "./crew-reservation-settled-manifest";
import { usePersistedState } from "./use-persisted-state";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { SDCPN } from "@hashintel/petrinaut-core";

export type CrewReservationSettlementStatus =
  | { readonly state: "idle" | "preparing" | "revalidating" }
  | { readonly state: "settled" }
  | {
      readonly detail?: string;
      readonly reason:
        | Extract<
            CrewReservationSettlementResult,
            { status: "refused" }
          >["reason"]
        | "bundle-snapshot-unavailable"
        | "history-unavailable"
        | "preparation-failed"
        | "settlement-failed";
      readonly state: "refused";
    };

type SetCrewReservationSettledManifest = (
  value:
    | CrewReservationSettledManifest
    | null
    | ((
        previous: CrewReservationSettledManifest | null,
      ) => CrewReservationSettledManifest | null),
) => void;

const readSettledManifest = (): CrewReservationSettledManifest | null => {
  const stored = readBrowserStorage(
    localStorage,
    crewReservationSettledManifestStorageKey,
  );
  if (stored === null) return null;
  try {
    return parseCrewReservationSettledManifest(JSON.parse(stored));
  } catch {
    return null;
  }
};

const writeSettledManifest = (
  settledManifest: CrewReservationSettledManifest | null,
): void => {
  if (settledManifest === null) {
    removeBrowserStorage(
      localStorage,
      crewReservationSettledManifestStorageKey,
    );
    return;
  }
  writeBrowserStorage(
    localStorage,
    crewReservationSettledManifestStorageKey,
    JSON.stringify(settledManifest),
  );
};

export const useCrewReservationSettledManifestStorage = (input?: {
  readonly enabled: boolean;
}) => {
  const enabled = input?.enabled ?? true;
  const [settledManifest, setSettledManifest] = usePersistedState({
    enabled,
    fallback: null as CrewReservationSettledManifest | null,
    read: readSettledManifest,
    write: writeSettledManifest,
  });
  return { settledManifest, setSettledManifest };
};

export const useCrewReservationSettlement = (input: {
  readonly definition: SDCPN | undefined;
  readonly enabled: boolean;
  readonly history: CrewReservationHistory | undefined;
  readonly historyError: string | undefined;
  readonly persistCoherentSnapshot: (sha256: string, definition: SDCPN) => void;
  readonly preparationError: string | undefined;
  readonly setSettledManifest: SetCrewReservationSettledManifest;
  readonly settledManifest: CrewReservationSettledManifest | null;
  readonly snapshotMissing: boolean;
}) => {
  const {
    definition,
    enabled,
    history,
    historyError,
    persistCoherentSnapshot,
    preparationError,
    setSettledManifest,
    settledManifest,
    snapshotMissing,
  } = input;
  const [observedStatus, setObservedStatus] =
    useState<CrewReservationSettlementStatus>({ state: "preparing" });

  useEffect(() => {
    if (
      !enabled ||
      historyError !== undefined ||
      snapshotMissing ||
      definition === undefined ||
      history === undefined
    ) {
      return;
    }

    let cancelled = false;
    const definitionSnapshot = structuredClone(definition);
    const settle = async (): Promise<void> => {
      let result: CrewReservationSettlementResult;
      try {
        result = await settleCrewReservationManifest({
          definition: definitionSnapshot,
          history,
          ...(settledManifest === null ? {} : { previous: settledManifest }),
          settledAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!cancelled) {
          setObservedStatus({
            state: "refused",
            reason: "settlement-failed",
            detail:
              error instanceof Error
                ? error.message
                : "The coherent bundle could not be inspected.",
          });
        }
        return;
      }
      if (cancelled) return;
      if (result.status === "refused") {
        setObservedStatus({
          state: "refused",
          reason: result.reason,
        });
        return;
      }
      persistCoherentSnapshot(
        result.manifest.document.sha256,
        definitionSnapshot,
      );
      if (result.manifest.manifestId !== settledManifest?.manifestId) {
        setSettledManifest(result.manifest);
      }
      setObservedStatus({ state: "settled" });
    };
    void settle();

    return () => {
      cancelled = true;
    };
  }, [
    definition,
    enabled,
    history,
    historyError,
    persistCoherentSnapshot,
    setSettledManifest,
    settledManifest,
    snapshotMissing,
  ]);

  const status: CrewReservationSettlementStatus = !enabled
    ? { state: "idle" }
    : historyError !== undefined
      ? {
          state: "refused",
          reason: "history-unavailable",
          detail: historyError,
        }
      : snapshotMissing
        ? {
            state: "refused",
            reason: "bundle-snapshot-unavailable",
          }
        : preparationError !== undefined &&
            (definition === undefined || history === undefined)
          ? {
              state: "refused",
              reason: "preparation-failed",
              detail: preparationError,
            }
          : definition === undefined || history === undefined
            ? settledManifest === null
              ? { state: "preparing" }
              : { state: "revalidating" }
            : observedStatus;
  return status;
};
