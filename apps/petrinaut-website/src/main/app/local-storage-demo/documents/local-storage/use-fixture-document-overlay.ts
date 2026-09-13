import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createJsonDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { observeBrowserDefinition } from "../../mutation-record";
import {
  crewReservationConversationId,
  crewReservationDocumentId,
  preparedCrewReservationNet,
} from "../../prepared-crew-reservation-fixture";
import { resolveCrewReservationBundle } from "../../resolve-crew-reservation-bundle";
import { useCrewReservationSettledManifestStorage } from "../../use-crew-reservation-settled-manifest";
import { registerFixtureDocumentSessionState } from "./fixture-document-session-state";

import type { SDCPNInLocalStorage } from "../../use-local-storage-sdcpns";
import type {
  DocumentRecord,
  DocumentRepository,
  DocumentSource,
} from "../document-repository";
import type { LocalDocumentRepositoryAdapter } from "./use-local-document-repository";

const fixtureCapabilities = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

export const legacyConstructionDocumentId =
  "synthetic-construction-substrate-v1";
export const rootArcTracerDocumentId = `${crewReservationDocumentId}:root-arc`;
export const rootCreationDocumentId = "synthetic-root-creation-v1";

const fixtureDocumentIds = new Set([
  crewReservationDocumentId,
  legacyConstructionDocumentId,
  rootArcTracerDocumentId,
  rootCreationDocumentId,
]);

const preparedCrewReservationStoredDocument: SDCPNInLocalStorage = {
  id: crewReservationDocumentId,
  uuid: "dbb1b22c-f595-4c1a-b348-89eec09b79c3",
  title: "Prepared final inspection and dispatch",
  sdcpn: preparedCrewReservationNet,
  lastUpdated: new Date(0).toISOString(),
};

const fixtureVersion = "local-prepared-fixture-v1";

const createFixtureRecord = (
  document: SDCPNInLocalStorage,
): DocumentRecord => ({
  documentId: document.id,
  incarnationId: document.incarnationId ?? crypto.randomUUID(),
  revisionId: document.revisionId ?? crypto.randomUUID(),
  title: document.title,
  definition: document.sdcpn,
  origin: {
    kind: "template",
    bundleKey: document.id,
    fixtureVersion,
  },
  lastUpdated: document.lastUpdated,
});

const createRootArcTracerDocument = (
  documentId: string,
  rootCreationSelected: boolean,
): SDCPNInLocalStorage => {
  const sdcpn = rootCreationSelected
    ? {
        places: [],
        transitions: [],
        types: [],
        parameters: [],
        differentialEquations: [],
      }
    : structuredClone(preparedCrewReservationNet);
  const handle = createJsonDocHandle({
    id: documentId,
    uuid: crypto.randomUUID(),
    initial: sdcpn,
    capabilities: fixtureCapabilities,
  });
  return {
    id: documentId,
    incarnationId: crypto.randomUUID(),
    revisionId: handle.revisionId.get(),
    rootArcRequestedBaseHash: rootCreationSelected
      ? undefined
      : observeBrowserDefinition(handle).sha256,
    sdcpn,
    title: rootCreationSelected
      ? "Synthetic root creation — empty document"
      : documentId === legacyConstructionDocumentId
        ? "Synthetic construction substrate — no prepared workpiece"
        : "Prepared root-arc mechanical tracer",
    lastUpdated: new Date(0).toISOString(),
  };
};

export const useFixtureDocumentOverlay = (
  local: LocalDocumentRepositoryAdapter,
  input: {
    readonly enabled: boolean;
    readonly crewReservationSelected: boolean;
    readonly rootArcTracerSelected: boolean;
    readonly constructionSelected: boolean;
    readonly rootCreationSelected: boolean;
  },
): DocumentSource => {
  const {
    repository: localRepository,
    storedDocuments,
    updateStoredDocuments,
  } = local;
  const tracerDocumentId = input.constructionSelected
    ? input.rootCreationSelected
      ? rootCreationDocumentId
      : legacyConstructionDocumentId
    : rootArcTracerDocumentId;
  const fixtureDocumentId = input.rootArcTracerSelected
    ? tracerDocumentId
    : crewReservationDocumentId;
  const selected = input.enabled && input.crewReservationSelected;
  const [generatedTracerDocuments] = useState(
    () =>
      new Map<string, SDCPNInLocalStorage>([
        [
          rootArcTracerDocumentId,
          createRootArcTracerDocument(rootArcTracerDocumentId, false),
        ],
        [
          legacyConstructionDocumentId,
          createRootArcTracerDocument(legacyConstructionDocumentId, false),
        ],
        [
          rootCreationDocumentId,
          createRootArcTracerDocument(rootCreationDocumentId, true),
        ],
      ]),
  );
  const generatedTracerDocument =
    generatedTracerDocuments.get(tracerDocumentId);
  if (generatedTracerDocument === undefined)
    throw new Error(`No generated fixture document for ${tracerDocumentId}.`);
  const { settledManifest, setSettledManifest } =
    useCrewReservationSettledManifestStorage({ enabled: selected });
  const crewReservationBundle = resolveCrewReservationBundle({
    fallbackDocument: preparedCrewReservationStoredDocument,
    manifest: settledManifest,
    storedDocument: storedDocuments[crewReservationDocumentId],
  });
  const selectedStoredDocument = input.rootArcTracerSelected
    ? (storedDocuments[tracerDocumentId] ?? generatedTracerDocument)
    : crewReservationBundle.selectedDocument;
  if (selected && selectedStoredDocument.id !== fixtureDocumentId)
    throw new Error(
      `Fixture storage key ${fixtureDocumentId} contains document ${selectedStoredDocument.id}.`,
    );
  const selectedRecord = useMemo(
    () => createFixtureRecord(selectedStoredDocument),
    [selectedStoredDocument],
  );
  const persistedRevisionRef = useRef({
    documentId: selectedRecord.documentId,
    revisionId: selectedRecord.revisionId,
  });
  useEffect(() => {
    persistedRevisionRef.current = {
      documentId: selectedRecord.documentId,
      revisionId: selectedRecord.revisionId,
    };
  }, [selectedRecord.documentId, selectedRecord.revisionId]);

  useEffect(() => {
    if (!selected) return;
    updateStoredDocuments((previous) => {
      const stored = previous[fixtureDocumentId];
      if (
        stored?.incarnationId === selectedRecord.incarnationId &&
        stored.revisionId === selectedRecord.revisionId
      ) {
        return previous;
      }
      return {
        ...previous,
        [fixtureDocumentId]: {
          ...(stored ?? selectedStoredDocument),
          incarnationId: selectedRecord.incarnationId,
          revisionId: selectedRecord.revisionId,
        },
      };
    });
  }, [
    fixtureDocumentId,
    selected,
    selectedRecord.incarnationId,
    selectedRecord.revisionId,
    selectedStoredDocument,
    updateStoredDocuments,
  ]);

  const persistRevision: DocumentRepository["persistRevision"] = useCallback(
    async (change) => {
      if (change.documentId !== fixtureDocumentId) {
        if (fixtureDocumentIds.has(change.documentId))
          throw new Error(
            `Fixture repository is currently bound to ${fixtureDocumentId}, not ${change.documentId}.`,
          );
        return localRepository.persistRevision(change);
      }
      if (
        selectedRecord.documentId !== fixtureDocumentId ||
        persistedRevisionRef.current.documentId !== fixtureDocumentId
      )
        throw new Error(
          `Fixture repository identity does not match ${fixtureDocumentId}.`,
        );
      if (change.incarnationId !== selectedRecord.incarnationId)
        throw new Error(
          `Fixture document ${change.documentId} has a different incarnation.`,
        );
      if (persistedRevisionRef.current.revisionId !== change.previousRevisionId)
        throw new Error(
          `Fixture document ${change.documentId} revision does not follow its predecessor.`,
        );
      persistedRevisionRef.current = {
        documentId: change.documentId,
        revisionId: change.revisionId,
      };
      const stored =
        storedDocuments[fixtureDocumentId] ?? selectedStoredDocument;
      updateStoredDocuments((previous) => {
        const latest = previous[fixtureDocumentId] ?? stored;
        return {
          ...previous,
          [fixtureDocumentId]: {
            ...latest,
            incarnationId: change.incarnationId,
            revisionId: change.revisionId,
            sdcpn: change.definition,
            lastUpdated: new Date().toISOString(),
          },
        };
      });
    },
    [
      fixtureDocumentId,
      localRepository,
      selectedRecord.documentId,
      selectedRecord.incarnationId,
      selectedStoredDocument,
      storedDocuments,
      updateStoredDocuments,
    ],
  );

  const records = useMemo(
    () =>
      selected
        ? [
            ...localRepository.records.filter(
              ({ documentId }) => documentId !== fixtureDocumentId,
            ),
            selectedRecord,
          ]
        : localRepository.records,
    [fixtureDocumentId, localRepository.records, selected, selectedRecord],
  );

  const repository = useMemo<DocumentRepository>(
    () => ({
      ...localRepository,
      records,
      current: selected ? selectedRecord : localRepository.current,
      open: (documentId) => {
        if (documentId === fixtureDocumentId) return;
        if (fixtureDocumentIds.has(documentId))
          throw new Error(
            `Fixture repository is currently bound to ${fixtureDocumentId}, not ${documentId}.`,
          );
        localRepository.open(documentId);
      },
      persistRevision,
      settleRevision: async ({ documentId, revisionId }) => {
        if (documentId !== fixtureDocumentId) {
          if (fixtureDocumentIds.has(documentId))
            throw new Error(
              `Fixture repository is currently bound to ${fixtureDocumentId}, not ${documentId}.`,
            );
          return localRepository.settleRevision({ documentId, revisionId });
        }
        if (
          persistedRevisionRef.current.documentId !== documentId ||
          persistedRevisionRef.current.revisionId !== revisionId
        )
          throw new Error(
            `Fixture document ${documentId} has not persisted revision ${revisionId}.`,
          );
      },
    }),
    [
      fixtureDocumentId,
      localRepository,
      persistRevision,
      records,
      selected,
      selectedRecord,
    ],
  );

  const persistCoherentSnapshot = useCallback(
    (sha256: string, definition: SDCPN) => {
      updateStoredDocuments((previous) => {
        const document =
          previous[crewReservationDocumentId] ??
          preparedCrewReservationStoredDocument;
        return {
          ...previous,
          [crewReservationDocumentId]: {
            ...document,
            coherentSnapshots: {
              ...document.coherentSnapshots,
              [sha256]: structuredClone(definition),
            },
          },
        };
      });
    },
    [updateStoredDocuments],
  );

  useEffect(() => {
    registerFixtureDocumentSessionState(repository, {
      settledManifest,
      setSettledManifest,
      snapshotMissing: crewReservationBundle.snapshotMissing,
      persistCoherentSnapshot,
    });
  }, [
    crewReservationBundle.snapshotMissing,
    persistCoherentSnapshot,
    repository,
    setSettledManifest,
    settledManifest,
  ]);

  const processAgentSeed = useMemo<DocumentSource["processAgentSeed"]>(() => {
    if (!selected) return undefined;
    const fixture = !input.rootArcTracerSelected
      ? { mode: "prepared" as const }
      : input.rootCreationSelected
        ? { mode: "root-creation" as const }
        : input.constructionSelected
          ? { mode: "construction" as const }
          : {
              mode: "root-arc" as const,
              ...(selectedStoredDocument.rootArcRequestedBaseHash === undefined
                ? {}
                : {
                    requestedBaseHash:
                      selectedStoredDocument.rootArcRequestedBaseHash,
                  }),
            };
    const conversationId =
      fixture.mode === "prepared"
        ? crewReservationConversationId
        : `${
            fixture.mode === "root-creation"
              ? "root-creation-candidate-v1"
              : fixture.mode === "construction"
                ? "construction-candidate-v1"
                : "prepared-root-arc"
          }:${selectedRecord.incarnationId}`;
    return {
      documentId: selectedRecord.documentId,
      conversationId,
      fixture,
    };
  }, [
    input.constructionSelected,
    input.rootArcTracerSelected,
    input.rootCreationSelected,
    selected,
    selectedRecord.documentId,
    selectedRecord.incarnationId,
    selectedStoredDocument.rootArcRequestedBaseHash,
  ]);

  return useMemo(
    () => ({
      repository,
      ...(processAgentSeed === undefined ? {} : { processAgentSeed }),
    }),
    [processAgentSeed, repository],
  );
};
