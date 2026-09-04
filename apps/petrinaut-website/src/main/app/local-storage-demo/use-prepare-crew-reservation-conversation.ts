import { useEffect, useState } from "react";

import { prepareCrewReservationConversation } from "./prepare-crew-reservation-conversation";

import type { FlueClient } from "@flue/sdk";

export type CrewReservationPreparationStatus =
  | { readonly state: "idle" | "preparing" | "ready" }
  | { readonly error: string; readonly state: "failed" };

export const usePrepareCrewReservationConversation = (
  clientPromise: Promise<FlueClient> | null,
  enabled: boolean,
): CrewReservationPreparationStatus => {
  const [observed, setObserved] = useState<{
    readonly clientPromise: Promise<FlueClient>;
    readonly status: CrewReservationPreparationStatus;
  }>();

  useEffect(() => {
    if (!enabled || clientPromise === null) return;

    let cancelled = false;
    const prepare = async (): Promise<void> => {
      try {
        const client = await clientPromise;
        await prepareCrewReservationConversation(client);
        if (!cancelled) {
          setObserved({ clientPromise, status: { state: "ready" } });
        }
      } catch (error) {
        if (cancelled) return;
        setObserved({
          clientPromise,
          status: {
            state: "failed",
            error:
              error instanceof Error
                ? error.message
                : "The prepared conversation could not be initialized.",
          },
        });
      }
    };
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [clientPromise, enabled]);

  if (!enabled) return { state: "idle" };
  return observed?.clientPromise === clientPromise
    ? observed.status
    : { state: "preparing" };
};
