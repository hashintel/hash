import { useEffect, useMemo, useState } from "react";

import { prepareCrewReservationConversation } from "./prepare-crew-reservation-conversation";

import type { FlueClient } from "@flue/sdk";

export type CrewReservationPreparationStatus =
  | { readonly state: "idle" | "preparing" | "ready" }
  | { readonly error: string; readonly state: "failed" };

export const usePrepareCrewReservationConversation = (
  clientPromise: Promise<FlueClient> | null,
  enabled: boolean,
): {
  readonly clientPromise: Promise<FlueClient> | null;
  readonly status: CrewReservationPreparationStatus;
} => {
  const preparedClientPromise = useMemo(() => {
    if (!enabled || clientPromise === null) return clientPromise;
    return clientPromise.then(async (client) => {
      await prepareCrewReservationConversation(client);
      return client;
    });
  }, [clientPromise, enabled]);
  const [observed, setObserved] = useState<{
    readonly clientPromise: Promise<FlueClient>;
    readonly status: CrewReservationPreparationStatus;
  }>();

  useEffect(() => {
    if (!enabled || preparedClientPromise === null) return;

    let cancelled = false;
    const prepare = async (): Promise<void> => {
      try {
        await preparedClientPromise;
        if (!cancelled) {
          setObserved({
            clientPromise: preparedClientPromise,
            status: { state: "ready" },
          });
        }
      } catch (error) {
        if (cancelled) return;
        setObserved({
          clientPromise: preparedClientPromise,
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
  }, [enabled, preparedClientPromise]);

  const status: CrewReservationPreparationStatus = !enabled
    ? { state: "idle" }
    : observed?.clientPromise === preparedClientPromise
      ? observed.status
      : { state: "preparing" };
  return { clientPromise: preparedClientPromise, status };
};
