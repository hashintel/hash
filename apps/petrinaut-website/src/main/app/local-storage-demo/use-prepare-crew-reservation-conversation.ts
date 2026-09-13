import { useEffect, useState } from "react";

import { prepareCrewReservationConversation } from "./prepare-crew-reservation-conversation";

import type { FlueClient } from "@flue/sdk";

export type CrewReservationPreparationStatus =
  | { readonly state: "idle" | "preparing" | "ready" }
  | { readonly error: string; readonly state: "failed" };

const hasRequestedBaseHash = <Browser extends object>(
  browser: Browser,
): browser is Browser & { readonly requestedBaseHash: string } =>
  "requestedBaseHash" in browser &&
  typeof browser.requestedBaseHash === "string";

/** The joined prepared-fixture tracer only; ordinary batched construction must not inherit it. */
export const selectCrewReservationPreparationBrowser = <Browser extends object>(
  batchedConstruction: boolean,
  browser: Browser | undefined,
): (Browser & { readonly requestedBaseHash: string }) | undefined => {
  if (
    batchedConstruction ||
    browser === undefined ||
    !hasRequestedBaseHash(browser)
  ) {
    return undefined;
  }
  return browser;
};

export const usePrepareCrewReservationConversation = (
  clientPromise: Promise<FlueClient> | null,
  enabled: boolean,
  browser?: Parameters<typeof prepareCrewReservationConversation>[1],
): {
  readonly clientPromise: Promise<FlueClient> | null;
  readonly status: CrewReservationPreparationStatus;
} => {
  const [observed, setObserved] = useState<{
    readonly sourceClientPromise: Promise<FlueClient>;
    readonly clientPromise: Promise<FlueClient>;
    readonly status: CrewReservationPreparationStatus;
  }>();

  useEffect(() => {
    if (!enabled || clientPromise === null) return;

    let cancelled = false;
    const preparedClientPromise = clientPromise.then(async (client) => {
      await prepareCrewReservationConversation(client, browser);
      return client;
    });
    void preparedClientPromise.catch(() => {});
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- the committed effect owns creation and publication of this server work
    setObserved({
      sourceClientPromise: clientPromise,
      clientPromise: preparedClientPromise,
      status: { state: "preparing" },
    });
    const prepare = async (): Promise<void> => {
      try {
        await preparedClientPromise;
        if (!cancelled) {
          setObserved({
            sourceClientPromise: clientPromise,
            clientPromise: preparedClientPromise,
            status: { state: "ready" },
          });
        }
      } catch (error) {
        if (cancelled) return;
        setObserved({
          sourceClientPromise: clientPromise,
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
  }, [browser, clientPromise, enabled]);

  const status: CrewReservationPreparationStatus = !enabled
    ? { state: "idle" }
    : observed?.sourceClientPromise === clientPromise
      ? observed.status
      : { state: "preparing" };
  return {
    clientPromise:
      enabled && observed?.sourceClientPromise === clientPromise
        ? observed.clientPromise
        : enabled
          ? null
          : clientPromise,
    status,
  };
};
