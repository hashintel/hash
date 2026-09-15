import { useSyncExternalStore } from "react";

import type { CrewReservationSettledManifest } from "../../crew-reservation-settled-manifest";
import type { DocumentRepository } from "../document-repository";
import type { SDCPN } from "@hashintel/petrinaut-core";

export interface FixtureDocumentSessionState {
  readonly persistCoherentSnapshot: (sha256: string, definition: SDCPN) => void;
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
}

const sessionStateByRepository = new WeakMap<
  DocumentRepository,
  FixtureDocumentSessionState
>();
const listenersByRepository = new WeakMap<
  DocumentRepository,
  Set<() => void>
>();

export const registerFixtureDocumentSessionState = (
  repository: DocumentRepository,
  state: FixtureDocumentSessionState,
): void => {
  sessionStateByRepository.set(repository, state);
  for (const listener of listenersByRepository.get(repository) ?? [])
    listener();
};

export const fixtureDocumentSessionStateFor = (
  repository: DocumentRepository,
): FixtureDocumentSessionState | null =>
  sessionStateByRepository.get(repository) ?? null;

export const useFixtureDocumentSessionState = (
  repository: DocumentRepository,
): FixtureDocumentSessionState | null =>
  useSyncExternalStore(
    (listener) => {
      const listeners = listenersByRepository.get(repository) ?? new Set();
      listeners.add(listener);
      listenersByRepository.set(repository, listeners);
      return () => {
        listeners.delete(listener);
      };
    },
    () => fixtureDocumentSessionStateFor(repository),
    () => null,
  );
