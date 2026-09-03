import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";

import {
  CREW_RESERVATION_SETTLED_MANIFEST_STORAGE_KEY,
  settleCrewReservationManifest,
  type CrewReservationSettledHistory,
  type CrewReservationSettledManifest,
  type CrewReservationSettlementResult,
} from "./crew-reservation-settled-manifest";

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
        | "history-unavailable"
        | "settlement-failed";
      readonly state: "refused";
    };

export const useCrewReservationSettledManifest = (input: {
  readonly definition: SDCPN | undefined;
  readonly enabled: boolean;
  readonly history: CrewReservationSettledHistory | undefined;
  readonly historyError: string | undefined;
}) => {
  const [settledManifest, setSettledManifest] =
    useLocalStorage<CrewReservationSettledManifest | null>({
      key: CREW_RESERVATION_SETTLED_MANIFEST_STORAGE_KEY,
      defaultValue: null,
      getInitialValueInEffect: false,
    });
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
      !input.enabled ||
      input.historyError !== undefined ||
      input.definition === undefined ||
      input.history === undefined
    ) {
      return;
    }

    const definition = structuredClone(input.definition);
    const history = input.history;
    queueRef.current = queueRef.current.then(async () => {
      if (observationId !== observationIdRef.current) return;
      let result: CrewReservationSettlementResult;
      try {
        result = await settleCrewReservationManifest({
          definition,
          history,
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
      if (result.manifest.manifestId !== manifestRef.current?.manifestId) {
        manifestRef.current = result.manifest;
        setSettledManifest(result.manifest);
      }
      setObservedStatus({ state: "settled" });
    });
  }, [
    input.definition,
    input.enabled,
    input.history,
    input.historyError,
    setSettledManifest,
  ]);

  const status: CrewReservationSettlementStatus = !input.enabled
    ? { state: "idle" }
    : input.historyError !== undefined
      ? {
          state: "refused",
          reason: "history-unavailable",
          detail: input.historyError,
        }
      : input.definition === undefined || input.history === undefined
        ? { state: "preparing" }
        : observedStatus;
  return { settledManifest, status };
};
