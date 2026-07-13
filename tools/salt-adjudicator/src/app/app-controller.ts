import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import {
  type Label,
  type Study,
  DecisionTimer,
  LABEL_DETAILS,
  SaltValidationError,
  activeSwipes,
  adjudicationsToJsonl,
  codeSheetToTsv,
  createAdjudication,
  createRetractionEvent,
  createStudy,
  createSwipeEvent,
  edgeCaseMarkdown,
  getProductionDeck,
  getQualificationDeck,
  manifestForExport,
  nextIncompletePass,
  nextMonotoneTimestamp,
  parseAdjudicationsJsonl,
  parseCardsJsonl,
  parseRoster,
  parseSwipesJsonl,
  projectSwipes,
  relationSummaries,
  resolveAnnotatorCode,
  safeFilenamePart,
  serializePayload,
  swipesToJsonl,
} from "../core.ts";
import {
  activeStudy,
  computeMerge,
  mergeWarnings,
  type MergeComputation,
} from "./app-controller/merge.ts";
import {
  type AppState,
  type BuilderFileKind,
  type EmbeddedPayload,
  type SessionSnapshot,
  type StoredAdjudicationRecord,
  type SwipeContext,
  type WorkspaceTab,
  createInitialState,
  createSessionSnapshot,
  isLabel,
  isSessionSnapshot,
  isStoredAdjudicationRecord,
  isVerificationManifest,
  SessionRepository,
} from "./app-controller/model.ts";

export type {
  AppMode,
  AppState,
  BuilderFileKind,
  DropKind,
  EmbeddedPayload,
  GenericEmbeddedPayload,
  ImportedSwipeRecord,
  MergeFileKind,
  MergeStudy,
  ProductionSwipeContext,
  QualificationReviewContext,
  QualificationSwipeContext,
  SessionSnapshot,
  StoredAdjudicationRecord,
  SwipeContext,
  VerificationManifest,
  WorkspaceTab,
} from "./app-controller/model.ts";
export { parseEmbeddedPayload } from "./app-controller/model.ts";

export interface BuilderFormValues {
  title: string;
  rubricVersion: string;
  seed: string;
  roster: string;
  coverageTarget: number;
  sliceSize: number;
  coincidentTarget: number;
}

export interface AdjudicationFormValues {
  label: Label;
  rationale: string;
  adjudicatorId: string;
}

export interface AppActions {
  openHome: () => void;
  openDemo: () => void;
  openBuilder: () => void;
  openMerge: () => void;
  beginCodeEntry: (code: string) => void;
  resumeSession: () => void;
  requestRestart: () => void;
  cancelRestart: () => void;
  restartSession: () => void;
  selectTab: (tab: WorkspaceTab) => void;
  decide: (label: Label) => void;
  toggleFlag: () => void;
  toggleNote: () => void;
  openNote: () => void;
  keepNote: () => void;
  clearNote: () => void;
  setNoteDraft: (note: string) => void;
  openGuide: () => void;
  closeGuide: () => void;
  undoLastSwipe: () => void;
  exportSwipes: () => void;
  startNextPass: () => void;
  completeQualificationReview: () => void;
  endSession: () => void;
  openRubric: () => void;
  closeRubric: () => void;
  changeRubric: (rubricVersion: string) => void;
  loadBuilderFile: (
    kind: BuilderFileKind,
    file: File | undefined,
  ) => Promise<void>;
  clearBuilder: () => void;
  generateStudy: (values: BuilderFormValues) => void;
  downloadStudy: () => void;
  downloadCodes: () => void;
  downloadManifest: () => void;
  loadMergeFiles: (files: readonly File[]) => Promise<void>;
  loadManifestFile: (file: File | undefined) => Promise<void>;
  loadAdjudicationFile: (file: File | undefined) => Promise<void>;
  removeMergeSource: (filename: string) => void;
  startResolve: () => void;
  adjudicate: (values: AdjudicationFormValues) => void;
  exportEdgeTable: (scope: "local" | "merge") => void;
  exportAdjudications: () => void;
}

export interface AppController {
  state: AppState;
  embeddedPayload: EmbeddedPayload;
  swipeContext: SwipeContext | null;
  merge: MergeComputation;
  warnings: string[];
  getSessionElapsed: () => number;
  getUnsavedEventCount: () => number;
  actions: AppActions;
}

type Announce = (message: string) => void;

const persistenceErrorMessage = (error: unknown): string =>
  `SALT could not persist this action. Export immediately and free browser storage before continuing. ${
    error instanceof Error ? error.message : String(error)
  }`;

const adjudicationStorageKey = (studyId: string | undefined): string =>
  `salt:adjudications:${studyId || "unscoped"}`;

const getSwipeContext = (state: AppState): SwipeContext | null => {
  if (!state.study || !state.snapshot || !state.annotatorId) {
    return null;
  }

  if (!state.snapshot.qualification_reviewed) {
    const remaining = getQualificationDeck({
      study: state.study,
      annotatorId: state.annotatorId,
      events: state.snapshot.events,
    });
    if (remaining.length > 0) {
      return {
        phase: "qualification",
        pass: 0,
        card: remaining[0],
        remaining,
        total: state.study.qualification_cards.length,
        completed: state.study.qualification_cards.length - remaining.length,
      };
    }
    return {
      phase: "qualification-review",
      card: null,
      remaining: [],
      total: state.study.qualification_cards.length,
      completed: state.study.qualification_cards.length,
    };
  }

  const pass = state.snapshot.current_pass;
  const remaining = getProductionDeck({
    study: state.study,
    annotatorId: state.annotatorId,
    pass,
    events: state.snapshot.events,
  });
  const completed = activeSwipes(state.snapshot.events).filter(
    (swipe) =>
      !swipe.qualification &&
      swipe.annotator_id === state.annotatorId &&
      swipe.pass === pass,
  ).length;
  return {
    phase: "production",
    pass,
    card: remaining[0] ?? null,
    remaining,
    total: completed + remaining.length,
    completed,
  };
};

const currentSessionElapsed = (state: AppState): number =>
  state.snapshot
    ? Math.max(0, Date.now() - Date.parse(state.snapshot.session_started_at))
    : 0;

const unsavedEventCount = (state: AppState): number =>
  state.snapshot
    ? Math.max(
        0,
        state.snapshot.events.length - state.snapshot.exported_event_count,
      )
    : 0;

const downloadText = (filename: string, text: string, type: string): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const buildStudyHtml = (study: Study): string => {
  if (
    document.querySelector('script[src], link[rel="stylesheet"][href]') ||
    document.querySelector('script[type="module"]')
  ) {
    throw new SaltValidationError(
      "Study HTML can only be exported from the built salt-adjudicator.html artifact. Run node build.ts first.",
    );
  }

  const clone = document.documentElement.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    throw new Error("SALT could not clone the study document.");
  }
  const clonedApp = clone.querySelector<HTMLElement>("#app");
  const clonedLiveRegion = clone.querySelector<HTMLElement>("#live-region");
  const clonedPayload = clone.querySelector<HTMLScriptElement>("#salt-study");
  if (!clonedApp || !clonedLiveRegion || !clonedPayload) {
    throw new Error("SALT could not clone its required application elements.");
  }

  const bootState = document.createElement("main");
  bootState.className = "boot-state";
  bootState.id = "main-content";
  const bootMessage = document.createElement("p");
  bootMessage.textContent = "SALT is loading…";
  bootState.append(bootMessage);
  clonedApp.replaceChildren(bootState);
  clonedLiveRegion.textContent = "";
  clonedPayload.textContent = serializePayload({
    kind: "study",
    study,
  });
  return `<!doctype html>\n${clone.outerHTML}`;
};

const loadSavedAdjudications = (
  state: AppState,
  studyId: string | undefined,
): AppState => {
  try {
    const serialized = localStorage.getItem(adjudicationStorageKey(studyId));
    if (!serialized) {
      return state;
    }
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return state;
    }
    const records = parsed.filter((record) =>
      isStoredAdjudicationRecord(record),
    );
    const knownRecords = new Set(
      state.merge.adjudications.map(
        (record) => `${record.relation_id}:${record.ts}`,
      ),
    );
    return {
      ...state,
      merge: {
        ...state.merge,
        adjudications: [
          ...state.merge.adjudications,
          ...records.filter(
            (record) => !knownRecords.has(`${record.relation_id}:${record.ts}`),
          ),
        ],
      },
    };
  } catch {
    return state;
  }
};

export const useAppController = (
  embeddedPayload: EmbeddedPayload,
  announce: Announce,
): AppController => {
  const [state, setState] = useState(() => createInitialState(embeddedPayload));
  const stateRef = useRef(state);
  const timerRef = useRef(new DecisionTimer());
  const timerCardKeyRef = useRef("");

  const publish = useCallback((nextState: AppState): void => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const persistAndPublish = useCallback(
    (nextState: AppState): boolean => {
      if (!nextState.repository || !nextState.snapshot) {
        publish(nextState);
        return true;
      }
      try {
        nextState.repository.save(nextState.snapshot);
        publish({ ...nextState, storageError: "" });
        return true;
      } catch (error) {
        publish({
          ...nextState,
          storageError: persistenceErrorMessage(error),
          transition: null,
        });
        return false;
      }
    },
    [publish],
  );

  const activateSession = useCallback(
    (snapshot: SessionSnapshot): void => {
      const currentState = stateRef.current;
      persistAndPublish({
        ...currentState,
        snapshot,
        resumeCandidate: null,
        mode: "workspace",
        activeTab: "adjudicate",
        flagged: false,
        noteOpen: false,
        noteDraft: "",
        transition: null,
        rubricOpen: false,
        guideOpen: false,
      });
    },
    [persistAndPublish],
  );

  const resetTransientCardState = useCallback(
    (currentState: AppState): AppState => {
      timerCardKeyRef.current = "";
      return {
        ...currentState,
        flagged: false,
        noteOpen: false,
        noteDraft: "",
        transition: null,
        guideOpen: false,
      };
    },
    [],
  );

  const beginCodeEntry = useCallback(
    (study: Study, code: string): void => {
      const currentState = stateRef.current;
      const annotatorId = resolveAnnotatorCode(study, code);
      if (!annotatorId) {
        publish({
          ...currentState,
          study,
          accessError:
            "That code does not match this study. Check every character and try again.",
        });
        return;
      }

      let repository: SessionRepository;
      try {
        repository = new SessionRepository(study, annotatorId);
      } catch (error) {
        publish({
          ...currentState,
          study,
          fatalError: `Browser storage is unavailable. SALT cannot begin because every swipe must be crash-safe. ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return;
      }

      let savedSession: unknown;
      try {
        savedSession = repository.load();
      } catch (error) {
        publish({
          ...currentState,
          study,
          fatalError: `The saved session could not be read. Export or clear this site's storage before continuing. ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return;
      }

      const nextState = {
        ...currentState,
        study,
        annotatorId,
        repository,
        accessError: "",
      };
      if (
        isSessionSnapshot(savedSession) &&
        savedSession.study_id === study.study_id &&
        savedSession.deck_hash === study.deck_hash
      ) {
        publish({
          ...nextState,
          resumeCandidate: savedSession,
          mode: "resume",
        });
      } else {
        stateRef.current = nextState;
        activateSession(createSessionSnapshot(study, annotatorId));
      }
    },
    [activateSession, publish],
  );

  const openHome = useCallback((): void => {
    const currentState = stateRef.current;
    const study =
      embeddedPayload.kind === "study" ? embeddedPayload.study : null;
    timerRef.current.pause();
    publish({
      ...currentState,
      mode: embeddedPayload.kind === "study" ? "access" : "home",
      activeTab: "adjudicate",
      study,
      snapshot: null,
      annotatorId: null,
      repository: null,
      resumeCandidate: null,
      restartConfirmation: false,
      storageError: "",
      rubricOpen: false,
      guideOpen: false,
      transition: null,
      noteOpen: false,
      noteDraft: "",
      flagged: false,
    });
  }, [embeddedPayload, publish]);

  const selectTab = useCallback(
    (tab: WorkspaceTab): void => {
      const currentState = stateRef.current;
      const leavingAdjudication =
        currentState.mode === "workspace" &&
        currentState.activeTab === "adjudicate" &&
        tab !== "adjudicate";
      const returningToAdjudication =
        currentState.mode === "workspace" &&
        currentState.activeTab !== "adjudicate" &&
        tab === "adjudicate";
      if (leavingAdjudication) {
        timerRef.current.pause();
      } else if (
        returningToAdjudication &&
        !currentState.noteOpen &&
        !document.hidden
      ) {
        timerRef.current.resume();
      }
      publish({
        ...currentState,
        activeTab: tab,
        mode: currentState.snapshot
          ? "workspace"
          : tab === "merge"
            ? "merge"
            : currentState.mode,
      });
    },
    [publish],
  );

  const decide = useCallback(
    (label: Label): void => {
      const currentState = stateRef.current;
      if (
        currentState.mode !== "workspace" ||
        currentState.activeTab !== "adjudicate" ||
        currentState.transition ||
        currentState.storageError ||
        !currentState.study ||
        !currentState.snapshot ||
        !currentState.annotatorId
      ) {
        return;
      }
      const context = getSwipeContext(currentState);
      if (!context?.card) {
        return;
      }

      const timestamp = nextMonotoneTimestamp(
        currentState.snapshot.last_timestamp_ms,
      );
      const timestampedSnapshot = {
        ...currentState.snapshot,
        last_timestamp_ms: timestamp.timestampMs,
      };
      const swipeEvent = createSwipeEvent({
        study: currentState.study,
        annotatorId: currentState.annotatorId,
        card: context.card,
        pass: context.pass,
        label,
        latencyMs: timerRef.current.elapsed(),
        flagged: currentState.flagged,
        note: currentState.noteDraft,
        rubricVersion: timestampedSnapshot.rubric_version,
        qualification: context.phase === "qualification",
        sessionId: timestampedSnapshot.session_id,
        sequence: timestampedSnapshot.events.length + 1,
        timestamp,
      });
      const nextState: AppState = {
        ...currentState,
        snapshot: {
          ...timestampedSnapshot,
          events: [...timestampedSnapshot.events, swipeEvent],
        },
        transition:
          context.phase === "qualification"
            ? {
                card: context.card,
                phase: "qualification",
                pass: 0,
                label,
              }
            : {
                card: context.card,
                phase: "production",
                pass: context.pass,
                label,
              },
        flagged: false,
        noteOpen: false,
        noteDraft: "",
      };
      persistAndPublish(nextState);
      announce(`${LABEL_DETAILS[label].name} recorded.`);
    },
    [announce, persistAndPublish],
  );

  const undoLastSwipe = useCallback((): void => {
    const currentState = stateRef.current;
    if (
      !currentState.snapshot ||
      !currentState.annotatorId ||
      currentState.storageError ||
      currentState.transition
    ) {
      return;
    }
    const context = getSwipeContext(currentState);
    const projectedSwipes = projectSwipes(currentState.snapshot.events);
    let swipe = null;
    for (
      let swipeIndex = projectedSwipes.length - 1;
      swipeIndex >= 0;
      swipeIndex -= 1
    ) {
      const candidateSwipe = projectedSwipes[swipeIndex];
      const samePhase =
        Boolean(candidateSwipe.qualification) ===
        (context?.phase === "qualification");
      if (
        candidateSwipe.session_id === currentState.snapshot.session_id &&
        !candidateSwipe.retracted &&
        samePhase
      ) {
        swipe = candidateSwipe;
        break;
      }
    }
    if (!swipe) {
      announce("Nothing in this session can be undone.");
      return;
    }

    const timestamp = nextMonotoneTimestamp(
      currentState.snapshot.last_timestamp_ms,
    );
    const timestampedSnapshot = {
      ...currentState.snapshot,
      last_timestamp_ms: timestamp.timestampMs,
    };
    const retractionEvent = createRetractionEvent({
      swipeId: swipe.swipe_id,
      annotatorId: currentState.annotatorId,
      sessionId: timestampedSnapshot.session_id,
      timestamp,
    });
    persistAndPublish(
      resetTransientCardState({
        ...currentState,
        snapshot: {
          ...timestampedSnapshot,
          current_pass: swipe.qualification
            ? timestampedSnapshot.current_pass
            : swipe.pass,
          events: [...timestampedSnapshot.events, retractionEvent],
        },
      }),
    );
    announce(`${swipe.relation_id} retracted and re-queued.`);
  }, [announce, persistAndPublish, resetTransientCardState]);

  const exportSwipes = useCallback((): void => {
    const currentState = stateRef.current;
    if (
      !currentState.snapshot ||
      !currentState.study ||
      !currentState.annotatorId
    ) {
      return;
    }
    const jsonl = swipesToJsonl(currentState.snapshot.events);
    if (!jsonl) {
      announce("There are no swipes to export yet.");
      return;
    }
    downloadText(
      `swipes-${safeFilenamePart(
        currentState.study.study_id,
      )}-${safeFilenamePart(currentState.annotatorId)}.jsonl`,
      jsonl,
      "application/x-ndjson;charset=utf-8",
    );
    const nextState = {
      ...currentState,
      snapshot: {
        ...currentState.snapshot,
        exported_event_count: currentState.snapshot.events.length,
      },
    };
    persistAndPublish(nextState);
    announce(
      `${projectSwipes(nextState.snapshot.events).length} swipes exported.`,
    );
  }, [announce, persistAndPublish]);

  const changeRubric = useCallback(
    (rubricVersion: string): void => {
      const currentState = stateRef.current;
      if (!currentState.snapshot || !currentState.annotatorId) {
        return;
      }
      const nextRubricVersion = rubricVersion.trim();
      if (
        !nextRubricVersion ||
        nextRubricVersion === currentState.snapshot.rubric_version
      ) {
        publish({ ...currentState, rubricOpen: false });
        return;
      }
      const timestamp = nextMonotoneTimestamp(
        currentState.snapshot.last_timestamp_ms,
      );
      const snapshot = currentState.snapshot;
      persistAndPublish({
        ...currentState,
        rubricOpen: false,
        snapshot: {
          ...snapshot,
          rubric_version: nextRubricVersion,
          last_timestamp_ms: timestamp.timestampMs,
          events: [
            ...snapshot.events,
            {
              event_type: "rubric_change",
              from: snapshot.rubric_version,
              to: nextRubricVersion,
              annotator_id: currentState.annotatorId,
              session_id: snapshot.session_id,
              ts: timestamp.iso,
            },
          ],
        },
      });
      announce(`Rubric changed to ${nextRubricVersion}.`);
    },
    [announce, persistAndPublish, publish],
  );

  const loadBuilderFile = useCallback(
    async (kind: BuilderFileKind, file: File | undefined): Promise<void> => {
      if (!file) {
        return;
      }
      try {
        const fileText = await file.text();
        const currentState = stateRef.current;
        if (kind === "cards") {
          publish({
            ...currentState,
            builder: {
              ...currentState.builder,
              cards: parseCardsJsonl(fileText),
              cardsName: file.name,
              error: null,
              result: null,
            },
          });
        } else {
          publish({
            ...currentState,
            builder: {
              ...currentState.builder,
              qualificationCards: parseCardsJsonl(fileText, {
                qualification: true,
              }),
              qualificationName: file.name,
              error: null,
              result: null,
            },
          });
        }
      } catch (error) {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          builder: { ...currentState.builder, error },
        });
      }
    },
    [publish],
  );

  const generateStudy = useCallback(
    (values: BuilderFormValues): void => {
      const currentState = stateRef.current;
      try {
        if (!currentState.builder.cards) {
          throw new SaltValidationError("Load production cards.jsonl first.");
        }
        const result = createStudy({
          cards: currentState.builder.cards,
          qualificationCards: currentState.builder.qualificationCards,
          annotatorIds: parseRoster(values.roster),
          seed: values.seed,
          coverageTarget: values.coverageTarget,
          sliceSize: values.sliceSize,
          rubricVersion: values.rubricVersion,
          coincidentTarget: values.coincidentTarget,
          title: values.title,
        });
        publish({
          ...currentState,
          builder: { ...currentState.builder, result, error: null },
        });
        announce(`Study ${result.study.study_id} generated.`);
      } catch (error) {
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            error,
            result: null,
          },
        });
      }
    },
    [announce, publish],
  );

  const loadMergeFiles = useCallback(
    async (files: readonly File[]): Promise<void> => {
      const sources = new Map(stateRef.current.merge.sources);
      try {
        for (const file of files) {
          sources.set(
            file.name,
            parseSwipesJsonl(await file.text(), file.name),
          );
        }
        const currentState = stateRef.current;
        publish({
          ...currentState,
          merge: {
            ...currentState.merge,
            sources,
            error: null,
            warning: "",
          },
        });
      } catch (error) {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          merge: {
            ...currentState.merge,
            sources,
            error,
          },
        });
      }
    },
    [publish],
  );

  const loadManifestFile = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file) {
        return;
      }
      try {
        const parsedManifest: unknown = JSON.parse(await file.text());
        if (!isVerificationManifest(parsedManifest)) {
          throw new SaltValidationError(
            `Could not load ${file.name}: expected a SALT verification manifest.`,
          );
        }
        const currentState = stateRef.current;
        publish({
          ...currentState,
          merge: {
            ...currentState.merge,
            manifest: parsedManifest,
            manifestName: file.name,
            error: null,
            warning: activeStudy(currentState, embeddedPayload)
              ? ""
              : "Manifest metadata loaded. Card text is unavailable outside its study bundle, but planned coverage can still be inspected downstream.",
          },
        });
      } catch (error) {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          merge: {
            ...currentState.merge,
            error: new SaltValidationError(
              `Could not load ${file.name}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          },
        });
      }
    },
    [embeddedPayload, publish],
  );

  const loadAdjudicationFile = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file) {
        return;
      }
      try {
        const parsedRecords = parseAdjudicationsJsonl(
          await file.text(),
          file.name,
        );
        const records = parsedRecords.filter((record) =>
          isStoredAdjudicationRecord(record),
        );
        if (records.length !== parsedRecords.length) {
          throw new SaltValidationError(
            `Could not load ${file.name}: every adjudication needs a timestamp.`,
          );
        }
        const currentState = stateRef.current;
        const recordsByKey = new Map<string, StoredAdjudicationRecord>(
          [...currentState.merge.adjudications, ...records].map((record) => [
            `${record.relation_id}:${record.ts}`,
            record,
          ]),
        );
        publish({
          ...currentState,
          merge: {
            ...currentState.merge,
            adjudications: [...recordsByKey.values()],
            error: null,
          },
        });
      } catch (error) {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          merge: { ...currentState.merge, error },
        });
      }
    },
    [publish],
  );

  const adjudicate = useCallback(
    (values: AdjudicationFormValues): void => {
      const currentState = stateRef.current;
      if (
        !isLabel(values.label) ||
        !values.rationale.trim() ||
        !values.adjudicatorId.trim()
      ) {
        publish({
          ...currentState,
          adjudicationError:
            "Choose a label and provide both a rationale and adjudicator ID.",
        });
        return;
      }
      const merge = computeMerge(currentState, embeddedPayload);
      const resolvedIds = new Set(
        currentState.merge.adjudications.map((record) => record.relation_id),
      );
      const currentSummary = merge.summaries.find(
        (summary) =>
          (summary.entropy > 0 || summary.labels.includes("U")) &&
          !resolvedIds.has(summary.relation_id),
      );
      if (!currentSummary) {
        return;
      }

      const timestamp = nextMonotoneTimestamp(
        currentState.lastAdjudicationTimestampMs,
      );
      const adjudication = createAdjudication({
        studyId:
          merge.study?.study_id ??
          currentSummary.swipes[0]?.study_id ??
          "unscoped",
        deckHash:
          merge.study?.deck_hash ??
          currentSummary.swipes[0]?.deck_hash ??
          "unknown",
        relationId: currentSummary.relation_id,
        cardHash:
          currentSummary.card?.card_hash ??
          currentSummary.swipes[0]?.card_hash ??
          "unknown",
        label: values.label,
        rationale: values.rationale.trim(),
        adjudicatorId: values.adjudicatorId.trim(),
        timestamp,
      });
      const nextState: AppState = {
        ...currentState,
        adjudicationError: "",
        lastAdjudicationTimestampMs: timestamp.timestampMs,
        merge: {
          ...currentState.merge,
          adjudications: [...currentState.merge.adjudications, adjudication],
        },
      };
      try {
        localStorage.setItem(
          adjudicationStorageKey(merge.study?.study_id ?? merge.studyIds[0]),
          JSON.stringify(nextState.merge.adjudications),
        );
        publish(nextState);
      } catch (error) {
        publish({
          ...nextState,
          adjudicationError: `Adjudication saved in memory but not browser storage: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
      announce(`${currentSummary.relation_id} adjudicated ${values.label}.`);
    },
    [announce, embeddedPayload, publish],
  );

  const exportEdgeTable = useCallback(
    (scope: "local" | "merge"): void => {
      const currentState = stateRef.current;
      let summaries;
      let study;
      if (scope === "local") {
        if (!currentState.snapshot || !currentState.study) {
          return;
        }
        summaries = relationSummaries(
          activeSwipes(currentState.snapshot.events).filter(
            (swipe) => !swipe.qualification,
          ),
          currentState.study.cards,
        );
        study = currentState.study;
      } else {
        const merge = computeMerge(currentState, embeddedPayload);
        summaries = merge.summaries;
        study = merge.study;
      }
      downloadText(
        `edge-case-table-${safeFilenamePart(study?.study_id ?? "merged")}.md`,
        edgeCaseMarkdown(summaries, currentState.merge.adjudications),
        "text/markdown;charset=utf-8",
      );
    },
    [embeddedPayload],
  );

  const actions = useMemo<AppActions>(
    () => ({
      openHome,
      openDemo: () => {
        if (embeddedPayload.kind === "generic") {
          beginCodeEntry(embeddedPayload.demo_study, embeddedPayload.demo_code);
        }
      },
      openBuilder: () => {
        const currentState = stateRef.current;
        publish({ ...currentState, mode: "builder" });
      },
      openMerge: () => {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          mode: currentState.snapshot ? "workspace" : "merge",
          activeTab: "merge",
        });
      },
      beginCodeEntry: (code) => {
        const study = stateRef.current.study;
        if (study) {
          beginCodeEntry(study, code);
        }
      },
      resumeSession: () => {
        const resumeCandidate = stateRef.current.resumeCandidate;
        if (resumeCandidate) {
          activateSession(resumeCandidate);
        }
      },
      requestRestart: () => {
        const currentState = stateRef.current;
        publish({ ...currentState, restartConfirmation: true });
      },
      cancelRestart: () => {
        const currentState = stateRef.current;
        publish({ ...currentState, restartConfirmation: false });
      },
      restartSession: () => {
        const currentState = stateRef.current;
        if (
          currentState.repository &&
          currentState.study &&
          currentState.annotatorId
        ) {
          currentState.repository.clear();
          activateSession(
            createSessionSnapshot(currentState.study, currentState.annotatorId),
          );
        }
      },
      selectTab,
      decide,
      toggleFlag: () => {
        const currentState = stateRef.current;
        const flagged = !currentState.flagged;
        publish({ ...currentState, flagged });
        announce(flagged ? "Card flagged." : "Flag removed.");
      },
      toggleNote: () => {
        const currentState = stateRef.current;
        const noteOpen = !currentState.noteOpen;
        if (noteOpen) {
          timerRef.current.pause();
        } else if (!document.hidden) {
          timerRef.current.resume();
        }
        publish({ ...currentState, noteOpen });
      },
      openNote: () => {
        const currentState = stateRef.current;
        timerRef.current.pause();
        publish({ ...currentState, noteOpen: true });
      },
      keepNote: () => {
        const currentState = stateRef.current;
        if (!document.hidden) {
          timerRef.current.resume();
        }
        publish({ ...currentState, noteOpen: false });
      },
      clearNote: () => {
        const currentState = stateRef.current;
        if (!document.hidden) {
          timerRef.current.resume();
        }
        publish({
          ...currentState,
          noteDraft: "",
          noteOpen: false,
        });
      },
      setNoteDraft: (note) => {
        const currentState = stateRef.current;
        publish({ ...currentState, noteDraft: note });
      },
      openGuide: () => {
        const currentState = stateRef.current;
        timerRef.current.pause();
        publish({ ...currentState, guideOpen: true });
      },
      closeGuide: () => {
        const currentState = stateRef.current;
        if (!currentState.noteOpen && !document.hidden) {
          timerRef.current.resume();
        }
        publish({ ...currentState, guideOpen: false });
      },
      undoLastSwipe,
      exportSwipes,
      startNextPass: () => {
        const currentState = stateRef.current;
        if (!currentState.snapshot) {
          return;
        }
        persistAndPublish(
          resetTransientCardState({
            ...currentState,
            snapshot: {
              ...currentState.snapshot,
              current_pass: currentState.snapshot.current_pass + 1,
            },
          }),
        );
      },
      completeQualificationReview: () => {
        const currentState = stateRef.current;
        if (
          !currentState.snapshot ||
          !currentState.study ||
          !currentState.annotatorId
        ) {
          return;
        }
        persistAndPublish(
          resetTransientCardState({
            ...currentState,
            snapshot: {
              ...currentState.snapshot,
              qualification_reviewed: true,
              current_pass: nextIncompletePass(
                currentState.study,
                currentState.annotatorId,
                currentState.snapshot.events,
              ),
            },
          }),
        );
        announce("Qualification complete. Production deck unlocked.");
      },
      endSession: () => {
        const currentState = stateRef.current;
        timerRef.current.pause();
        publish(
          resetTransientCardState({
            ...currentState,
            mode: "access",
            snapshot: null,
            annotatorId: null,
            repository: null,
            rubricOpen: false,
          }),
        );
      },
      openRubric: () => {
        const currentState = stateRef.current;
        publish({ ...currentState, rubricOpen: true });
      },
      closeRubric: () => {
        const currentState = stateRef.current;
        publish({ ...currentState, rubricOpen: false });
      },
      changeRubric,
      loadBuilderFile,
      clearBuilder: () => {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          builder: {
            cards: null,
            qualificationCards: [],
            cardsName: "",
            qualificationName: "",
            result: null,
            error: null,
          },
        });
      },
      generateStudy,
      downloadStudy: () => {
        const currentState = stateRef.current;
        const result = currentState.builder.result;
        if (!result) {
          return;
        }
        try {
          downloadText(
            `${safeFilenamePart(result.study.title)}-${result.study.study_id}.html`,
            buildStudyHtml(result.study),
            "text/html;charset=utf-8",
          );
          announce("Study HTML downloaded.");
        } catch (error) {
          publish({
            ...currentState,
            builder: { ...currentState.builder, error },
          });
        }
      },
      downloadCodes: () => {
        const result = stateRef.current.builder.result;
        if (result) {
          downloadText(
            `annotator-codes-${result.study.study_id}.tsv`,
            codeSheetToTsv(result.study, result.codeSheet),
            "text/tab-separated-values;charset=utf-8",
          );
        }
      },
      downloadManifest: () => {
        const result = stateRef.current.builder.result;
        if (result) {
          downloadText(
            `assignment-manifest-${result.study.study_id}.json`,
            `${JSON.stringify(manifestForExport(result.study), null, 2)}\n`,
            "application/json;charset=utf-8",
          );
        }
      },
      loadMergeFiles,
      loadManifestFile,
      loadAdjudicationFile,
      removeMergeSource: (filename) => {
        const currentState = stateRef.current;
        const sources = new Map(currentState.merge.sources);
        sources.delete(filename);
        publish({
          ...currentState,
          merge: { ...currentState.merge, sources },
        });
      },
      startResolve: () => {
        const currentState = stateRef.current;
        const merge = computeMerge(currentState, embeddedPayload);
        const stateWithSavedAdjudications = loadSavedAdjudications(
          currentState,
          merge.study?.study_id ?? merge.studyIds[0],
        );
        publish({
          ...stateWithSavedAdjudications,
          mode: stateWithSavedAdjudications.snapshot ? "workspace" : "resolve",
          activeTab: "resolve",
        });
      },
      adjudicate,
      exportEdgeTable,
      exportAdjudications: () => {
        const currentState = stateRef.current;
        const merge = computeMerge(currentState, embeddedPayload);
        downloadText(
          `adjudications-${safeFilenamePart(
            merge.study?.study_id ?? merge.studyIds[0] ?? "merged",
          )}.jsonl`,
          adjudicationsToJsonl(currentState.merge.adjudications),
          "application/x-ndjson;charset=utf-8",
        );
      },
    }),
    [
      activateSession,
      adjudicate,
      announce,
      beginCodeEntry,
      changeRubric,
      decide,
      embeddedPayload,
      exportEdgeTable,
      exportSwipes,
      generateStudy,
      loadAdjudicationFile,
      loadBuilderFile,
      loadManifestFile,
      loadMergeFiles,
      openHome,
      persistAndPublish,
      publish,
      resetTransientCardState,
      selectTab,
      undoLastSwipe,
    ],
  );

  const swipeContext = useMemo(() => getSwipeContext(state), [state]);
  const merge = useMemo(
    () => computeMerge(state, embeddedPayload),
    [embeddedPayload, state],
  );
  const warnings = useMemo(
    () => mergeWarnings(state, embeddedPayload, merge),
    [embeddedPayload, merge, state],
  );

  const timerCardKey =
    swipeContext?.card && state.snapshot
      ? `${state.snapshot.session_id}:${swipeContext.phase}:${swipeContext.pass}:${swipeContext.card.card_hash}`
      : "";
  useLayoutEffect(() => {
    if (
      !timerCardKey ||
      state.transition ||
      state.mode !== "workspace" ||
      state.activeTab !== "adjudicate"
    ) {
      return;
    }
    if (timerCardKeyRef.current !== timerCardKey) {
      timerRef.current.start();
      timerCardKeyRef.current = timerCardKey;
    }
    if (state.noteOpen || state.guideOpen || document.hidden) {
      timerRef.current.pause();
    } else {
      timerRef.current.resume();
    }
  }, [
    state.activeTab,
    state.guideOpen,
    state.mode,
    state.noteOpen,
    state.transition,
    timerCardKey,
  ]);

  useEffect(() => {
    if (!state.transition) {
      return;
    }
    const transition = state.transition;
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(
      () => {
        const currentState = stateRef.current;
        if (currentState.transition === transition) {
          publish({ ...currentState, transition: null });
        }
      },
      reducedMotion ? 0 : 115,
    );
    return () => window.clearTimeout(timeout);
  }, [publish, state.transition]);

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      const currentState = stateRef.current;
      if (
        currentState.mode !== "workspace" ||
        currentState.activeTab !== "adjudicate" ||
        !getSwipeContext(currentState)?.card
      ) {
        return;
      }
      if (document.hidden) {
        timerRef.current.pause();
      } else if (!currentState.noteOpen && !currentState.guideOpen) {
        timerRef.current.resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return {
    state,
    embeddedPayload,
    swipeContext,
    merge,
    warnings,
    getSessionElapsed: () => currentSessionElapsed(stateRef.current),
    getUnsavedEventCount: () => unsavedEventCount(stateRef.current),
    actions,
  };
};
