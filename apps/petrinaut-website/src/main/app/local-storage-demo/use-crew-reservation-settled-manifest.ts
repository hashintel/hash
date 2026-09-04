import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";

import {
  crewReservationSettledManifestStorageKey,
  settleCrewReservationManifest,
  type CrewReservationSettledManifest,
  type CrewReservationSettlementResult,
} from "./crew-reservation-settled-manifest";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { SDCPN } from "@hashintel/petrinaut-core";

export type CrewReservationSettlementStatus =
  | { readonly state: "idle" | "preparing" }
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

export const useCrewReservationSettledManifestStorage = () => {
  const [settledManifest, setSettledManifest] =
    useLocalStorage<CrewReservationSettledManifest | null>({
      key: crewReservationSettledManifestStorageKey,
      defaultValue: null,
      getInitialValueInEffect: false,
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
  const manifestRef = useRef(settledManifest);
  const observationIdRef = useRef(0);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    manifestRef.current = settledManifest;
  }, [settledManifest]);

  useEffect(() => {
    const observationId = observationIdRef.current + 1;
    observationIdRef.current = observationId;
    if (
      !enabled ||
      historyError !== undefined ||
      definition === undefined ||
      history === undefined
    ) {
      return;
    }

    const definitionSnapshot = structuredClone(definition);
    const historySnapshot = history;
    queueRef.current = queueRef.current.then(async () => {
      if (observationId !== observationIdRef.current) return;
      let result: CrewReservationSettlementResult;
      try {
        result = await settleCrewReservationManifest({
          definition: definitionSnapshot,
          history: historySnapshot,
          ...(manifestRef.current === null
            ? {}
            : { previous: manifestRef.current }),
          settledAt: new Date().toISOString(),
        });
      } catch (error) {
        if (observationId === observationIdRef.current) {
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
      if (observationId !== observationIdRef.current) return;
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
      if (result.manifest.manifestId !== manifestRef.current?.manifestId) {
        manifestRef.current = result.manifest;
        setSettledManifest(result.manifest);
      }
      setObservedStatus({ state: "settled" });
    });
  }, [
    definition,
    enabled,
    history,
    historyError,
    persistCoherentSnapshot,
    setSettledManifest,
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
            ? { state: "preparing" }
            : observedStatus;
  return status;
};
