import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import {
  type PlanningMode,
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
  formatZodIssues,
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
  safeParseStudyManifest,
  serializePayload,
  StoredAdjudicationRecordSchema,
  swipesToJsonl,
} from "../core.ts";
import {
  type QualificationDraft,
  type StudyPlan,
  partitionQualificationCards,
  planStudy,
  prepareStudySelection,
} from "../study-planning.ts";
import {
  activeStudy,
  computeMerge,
  mergeWarnings,
  type MergeComputation,
} from "./app-controller/merge.ts";
import {
  type AppState,
  type BuilderFileKind,
  type BuilderStep,
  type EmbeddedPayload,
  type SessionSnapshot,
  type StoredAdjudicationRecord,
  type SwipeContext,
  type WorkspaceTab,
  createInitialState,
  createSessionSnapshot,
  isLabel,
  isStoredAdjudicationRecord,
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
  plannerMode: PlanningMode;
  coverageTarget: number;
  productionCardsPerAnnotator: number;
  sampleSize: number;
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
  setBuilderStep: (step: BuilderStep) => void;
  invalidateBuilderPlan: () => void;
  selectBuilderCard: (relationId: string) => void;
  saveQualificationDraft: (draft: QualificationDraft) => void;
  removeQualificationDraft: (relationId: string) => void;
  reviewStudy: (values: BuilderFormValues) => void;
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

const calculateBuilderPlan = (
  state: AppState,
  values: BuilderFormValues,
  annotatorCount: number,
): StudyPlan => {
  if (!state.builder.cards) {
    throw new SaltValidationError("Load a source card pool first.");
  }
  const common = {
    annotatorCount,
    eligiblePoolSize:
      state.builder.cards.length - state.builder.qualificationDrafts.length,
    qualificationSize: state.builder.qualificationDrafts.length,
  };
  if (values.plannerMode === "budget-first") {
    return planStudy({
      ...common,
      mode: values.plannerMode,
      productionCardsPerAnnotator: values.productionCardsPerAnnotator,
      coverageTarget: values.coverageTarget,
    });
  }
  if (values.plannerMode === "sample-first") {
    return planStudy({
      ...common,
      mode: values.plannerMode,
      productionCardsPerAnnotator: values.productionCardsPerAnnotator,
      sampleSize: values.sampleSize,
    });
  }
  return planStudy({
    ...common,
    mode: values.plannerMode,
    sampleSize: values.sampleSize,
    coverageTarget: values.coverageTarget,
  });
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
    const result = StoredAdjudicationRecordSchema.array().safeParse(parsed);
    if (!result.success) {
      throw new SaltValidationError(
        "Saved adjudications do not match the SALT adjudication contract.",
        formatZodIssues(result.error),
      );
    }
    const records = result.data;
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
  } catch (error) {
    return {
      ...state,
      merge: {
        ...state.merge,
        error:
          error instanceof SaltValidationError
            ? error
            : new SaltValidationError(
                `Saved adjudications could not be read: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
      },
    };
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

  const resumeDecisionTimer = useCallback((candidateState: AppState): void => {
    if (
      candidateState.mode === "workspace" &&
      candidateState.activeTab === "adjudicate" &&
      !candidateState.noteOpen &&
      !candidateState.guideOpen &&
      !candidateState.rubricOpen &&
      !document.hidden &&
      getSwipeContext(candidateState)?.card
    ) {
      timerRef.current.resume();
    }
  }, []);

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

      let savedSession: SessionSnapshot | null;
      try {
        savedSession = repository.load();
      } catch (error) {
        const details =
          error instanceof SaltValidationError && error.issues.length > 0
            ? `${error.message} ${error.issues.join(" ")}`
            : error instanceof Error
              ? error.message
              : String(error);
        publish({
          ...currentState,
          study,
          fatalError: `The saved session could not be read. Preserve this site's storage before continuing. ${details}`,
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
        savedSession &&
        (savedSession.study_id !== study.study_id ||
          savedSession.deck_hash !== study.deck_hash ||
          savedSession.annotator_id !== annotatorId)
      ) {
        publish({
          ...nextState,
          fatalError:
            "The saved session identity does not match this study, deck, and annotator. Preserve this site's storage before continuing.",
        });
      } else if (savedSession) {
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
        !currentState.guideOpen &&
        !currentState.rubricOpen &&
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
        currentState.guideOpen ||
        currentState.rubricOpen ||
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
        const nextState = { ...currentState, rubricOpen: false };
        resumeDecisionTimer(nextState);
        publish(nextState);
        return;
      }
      const timestamp = nextMonotoneTimestamp(
        currentState.snapshot.last_timestamp_ms,
      );
      const snapshot = currentState.snapshot;
      const nextState: AppState = {
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
      };
      persistAndPublish(nextState);
      resumeDecisionTimer(nextState);
      announce(`Rubric changed to ${nextRubricVersion}.`);
    },
    [announce, persistAndPublish, publish, resumeDecisionTimer],
  );

  const loadBuilderFile = useCallback(
    async (kind: BuilderFileKind, file: File | undefined): Promise<void> => {
      if (!file) {
        return;
      }
      try {
        const fileText = await file.text();
        const cards = parseCardsJsonl(fileText);
        const currentState = stateRef.current;
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            cards,
            cardsName: file.name,
            qualificationDrafts: [],
            selectedRelationId: cards[0]?.relation_id ?? null,
            step: "import",
            plan: null,
            error: null,
            result: null,
          },
        });
        announce(
          `${cards.length.toLocaleString()} source cards loaded from ${file.name}.`,
        );
      } catch (error) {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          builder: { ...currentState.builder, error },
        });
      }
    },
    [announce, publish],
  );

  const saveQualificationDraft = useCallback(
    (draft: QualificationDraft): void => {
      const currentState = stateRef.current;
      try {
        if (!currentState.builder.cards) {
          throw new SaltValidationError("Load a source card pool first.");
        }
        partitionQualificationCards(currentState.builder.cards, [draft]);
        const qualificationDrafts = [
          ...currentState.builder.qualificationDrafts.filter(
            (existingDraft) => existingDraft.relationId !== draft.relationId,
          ),
          { ...draft, rationale: draft.rationale.trim() },
        ];
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            qualificationDrafts,
            plan: null,
            result: null,
            error: null,
          },
        });
        announce(`${draft.relationId} saved as a qualification anchor.`);
      } catch (error) {
        publish({
          ...currentState,
          builder: { ...currentState.builder, error },
        });
      }
    },
    [announce, publish],
  );

  const reviewStudy = useCallback(
    (values: BuilderFormValues): void => {
      const currentState = stateRef.current;
      try {
        const annotatorIds = parseRoster(values.roster);
        const plan = calculateBuilderPlan(
          currentState,
          values,
          annotatorIds.length,
        );
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            plan,
            step: "review",
            result: null,
            error: null,
          },
        });
        announce(
          `Plan ready: ${plan.sampleSize.toLocaleString()} cards at ${plan.coverageTarget}× coverage.`,
        );
      } catch (error) {
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            plan: null,
            error,
          },
        });
      }
    },
    [announce, publish],
  );

  const generateStudy = useCallback(
    (values: BuilderFormValues): void => {
      const currentState = stateRef.current;
      try {
        const cards = currentState.builder.cards;
        if (!cards) {
          throw new SaltValidationError("Load a source card pool first.");
        }
        const annotatorIds = parseRoster(values.roster);
        const plan = calculateBuilderPlan(
          currentState,
          values,
          annotatorIds.length,
        );
        const selection = prepareStudySelection({
          sourcePool: cards,
          qualificationDrafts: currentState.builder.qualificationDrafts,
          plan,
          seed: values.seed,
        });
        const result = createStudy({
          cards: selection.productionCards,
          qualificationCards: selection.qualificationCards,
          annotatorIds,
          seed: values.seed,
          coverageTarget: plan.coverageTarget,
          sliceSize: plan.productionCardsPerAnnotator,
          rubricVersion: values.rubricVersion,
          coincidentTarget: values.coincidentTarget,
          title: values.title,
          sampling: selection.sampling,
        });
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            plan,
            step: "result",
            result,
            error: null,
          },
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
        const result = safeParseStudyManifest(parsedManifest);
        if (!result.success) {
          throw new SaltValidationError(
            `Could not load ${file.name}.`,
            formatZodIssues(result.error),
          );
        }
        const currentState = stateRef.current;
        publish({
          ...currentState,
          merge: {
            ...currentState.merge,
            manifest: result.data,
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
            error:
              error instanceof SaltValidationError
                ? error
                : new SaltValidationError(
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
      if (currentState.merge.error) {
        publish({
          ...currentState,
          adjudicationError:
            "Resolve the loaded evidence error before writing a binding adjudication.",
        });
        return;
      }
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
        } else {
          resumeDecisionTimer({ ...currentState, noteOpen });
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
        const nextState = { ...currentState, noteOpen: false };
        resumeDecisionTimer(nextState);
        publish(nextState);
      },
      clearNote: () => {
        const currentState = stateRef.current;
        const nextState = {
          ...currentState,
          noteDraft: "",
          noteOpen: false,
        };
        resumeDecisionTimer(nextState);
        publish(nextState);
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
        const nextState = { ...currentState, guideOpen: false };
        resumeDecisionTimer(nextState);
        publish(nextState);
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
        timerRef.current.pause();
        publish({ ...currentState, rubricOpen: true });
      },
      closeRubric: () => {
        const currentState = stateRef.current;
        const nextState = { ...currentState, rubricOpen: false };
        resumeDecisionTimer(nextState);
        publish(nextState);
      },
      changeRubric,
      loadBuilderFile,
      clearBuilder: () => {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          builder: {
            cards: null,
            cardsName: "",
            qualificationDrafts: [],
            selectedRelationId: null,
            step: "import",
            plan: null,
            result: null,
            error: null,
          },
        });
      },
      setBuilderStep: (step) => {
        const currentState = stateRef.current;
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            step,
            error: null,
          },
        });
      },
      invalidateBuilderPlan: () => {
        const currentState = stateRef.current;
        if (
          currentState.builder.plan === null &&
          currentState.builder.result === null
        ) {
          return;
        }
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            plan: null,
            result: null,
            error: null,
          },
        });
      },
      selectBuilderCard: (relationId) => {
        const currentState = stateRef.current;
        if (
          !currentState.builder.cards?.some(
            (card) => card.relation_id === relationId,
          )
        ) {
          return;
        }
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            selectedRelationId: relationId,
          },
        });
      },
      saveQualificationDraft,
      removeQualificationDraft: (relationId) => {
        const currentState = stateRef.current;
        const qualificationDrafts =
          currentState.builder.qualificationDrafts.filter(
            (draft) => draft.relationId !== relationId,
          );
        publish({
          ...currentState,
          builder: {
            ...currentState.builder,
            qualificationDrafts,
            plan: null,
            result: null,
            error: null,
          },
        });
        announce(`${relationId} removed from qualification anchors.`);
      },
      reviewStudy,
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
      reviewStudy,
      resumeDecisionTimer,
      saveQualificationDraft,
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
    if (
      state.noteOpen ||
      state.guideOpen ||
      state.rubricOpen ||
      document.hidden
    ) {
      timerRef.current.pause();
    } else {
      timerRef.current.resume();
    }
  }, [
    state.activeTab,
    state.guideOpen,
    state.mode,
    state.noteOpen,
    state.rubricOpen,
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
      } else if (
        !currentState.noteOpen &&
        !currentState.guideOpen &&
        !currentState.rubricOpen
      ) {
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
