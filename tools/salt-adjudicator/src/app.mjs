import {
  LABELS,
  LABEL_DETAILS,
  SaltValidationError,
  parseCardsJsonl,
  parseRoster,
  createStudy,
  manifestForExport,
  codeSheetToTsv,
  resolveAnnotatorCode,
  getProductionDeck,
  getQualificationDeck,
  nextIncompletePass,
  exampleSeedFor,
  shuffleCardText,
  DecisionTimer,
  nextMonotoneTimestamp,
  createSwipeEvent,
  createRetractionEvent,
  projectSwipes,
  activeSwipes,
  swipesToJsonl,
  parseSwipesJsonl,
  latestVotesByAnnotator,
  relationSummaries,
  agreementStatistics,
  parseAdjudicationsJsonl,
  adjudicationsToJsonl,
  createAdjudication,
  perAnnotatorGoldAgreement,
  edgeCaseMarkdown,
  summarizeCoverage,
  serializePayload,
  safeFilenamePart,
} from "./core.mjs";

const appElement = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");
const payloadElement = document.querySelector("#salt-study");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const parseEmbeddedPayload = () => {
  try {
    return JSON.parse(payloadElement.textContent);
  } catch (error) {
    return {
      kind: "error",
      message: `The embedded study payload is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
};

const embeddedPayload = parseEmbeddedPayload();

const state = {
  mode: embeddedPayload.kind === "study" ? "access" : "home",
  activeTab: "adjudicate",
  study:
    embeddedPayload.kind === "study" ? (embeddedPayload.study ?? null) : null,
  annotatorId: null,
  repository: null,
  snapshot: null,
  resumeCandidate: null,
  accessError: "",
  fatalError: embeddedPayload.kind === "error" ? embeddedPayload.message : "",
  restartConfirmation: false,
  timer: new DecisionTimer(),
  timedCardKey: "",
  flagged: false,
  noteOpen: false,
  noteDraft: "",
  transition: null,
  storageError: "",
  builder: {
    cards: null,
    qualificationCards: [],
    cardsName: "",
    qualificationName: "",
    result: null,
    error: null,
  },
  merge: {
    sources: new Map(),
    manifest: null,
    manifestName: "",
    adjudications: [],
    error: null,
    warning: "",
  },
  adjudicationError: "",
  lastAdjudicationTimestampMs: 0,
  pointerStart: null,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatInteger = (value) =>
  new Intl.NumberFormat("en-US").format(Math.round(value));

const formatPercent = (value, digits = 0) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(digits)}%`;

const formatAlpha = (value) =>
  value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(3);

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};

const announce = (message) => {
  liveRegion.textContent = "";
  window.requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
};

const renderIssues = (error) => {
  if (!error) {
    return "";
  }
  const issues =
    error instanceof SaltValidationError && error.issues.length > 0
      ? error.issues
      : [error instanceof Error ? error.message : String(error)];
  return `<div class="notice notice-error" role="alert">
    <strong>${escapeHtml(
      error instanceof Error ? error.message : "Something went wrong.",
    )}</strong>
    ${
      issues.length > 0
        ? `<ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`
        : ""
    }
  </div>`;
};

const downloadText = (filename, text, type) => {
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

class SessionRepository {
  constructor(study, annotatorId) {
    this.key = `salt:session:${study.study_id}:${study.deck_hash}:${annotatorId}`;
    const probeKey = `${this.key}:probe`;
    localStorage.setItem(probeKey, "ok");
    localStorage.removeItem(probeKey);
  }

  load() {
    const serialized = localStorage.getItem(this.key);
    if (!serialized) {
      return null;
    }
    return JSON.parse(serialized);
  }

  save(snapshot) {
    localStorage.setItem(this.key, JSON.stringify(snapshot));
  }

  clear() {
    localStorage.removeItem(this.key);
  }
}

const createSessionSnapshot = (study, annotatorId) => ({
  snapshot_version: 1,
  study_id: study.study_id,
  deck_hash: study.deck_hash,
  annotator_id: annotatorId,
  session_id: `${study.study_id}:${annotatorId}:${Date.now().toString(36)}`,
  session_started_at: new Date().toISOString(),
  current_pass: 1,
  rubric_version: study.rubric_version,
  qualification_reviewed: study.qualification_cards.length === 0,
  events: [],
  exported_event_count: 0,
  last_timestamp_ms: 0,
});

const persistSnapshot = () => {
  if (!state.repository || !state.snapshot) {
    return true;
  }
  try {
    state.repository.save(state.snapshot);
    state.storageError = "";
    return true;
  } catch (error) {
    state.storageError = `SALT could not persist this action. Export immediately and free browser storage before continuing. ${
      error instanceof Error ? error.message : String(error)
    }`;
    return false;
  }
};

const nextSessionTimestamp = () => {
  const timestamp = nextMonotoneTimestamp(
    state.snapshot?.last_timestamp_ms ?? 0,
  );
  state.snapshot = {
    ...state.snapshot,
    last_timestamp_ms: timestamp.timestampMs,
  };
  return timestamp;
};

const currentSessionElapsed = () => {
  if (!state.snapshot) {
    return 0;
  }
  return Math.max(
    0,
    Date.now() - Date.parse(state.snapshot.session_started_at),
  );
};

const unsavedEventCount = () =>
  state.snapshot
    ? Math.max(
        0,
        state.snapshot.events.length - state.snapshot.exported_event_count,
      )
    : 0;

const activeStudy = () =>
  state.study ??
  (embeddedPayload.kind === "generic" ? embeddedPayload.demo_study : null);

const beginCodeEntry = (study, code) => {
  state.study = study;
  state.accessError = "";
  const annotatorId = resolveAnnotatorCode(study, code);
  if (!annotatorId) {
    state.accessError =
      "That code does not match this study. Check every character and try again.";
    render();
    return;
  }

  let repository;
  try {
    repository = new SessionRepository(study, annotatorId);
  } catch (error) {
    state.fatalError = `Browser storage is unavailable. SALT cannot begin because every swipe must be crash-safe. ${
      error instanceof Error ? error.message : String(error)
    }`;
    render();
    return;
  }

  let saved;
  try {
    saved = repository.load();
  } catch (error) {
    state.fatalError = `The saved session could not be read. Export or clear this site's storage before continuing. ${
      error instanceof Error ? error.message : String(error)
    }`;
    render();
    return;
  }

  state.annotatorId = annotatorId;
  state.repository = repository;
  if (
    saved &&
    saved.study_id === study.study_id &&
    saved.deck_hash === study.deck_hash &&
    Array.isArray(saved.events)
  ) {
    state.resumeCandidate = saved;
    state.mode = "resume";
  } else {
    activateSession(createSessionSnapshot(study, annotatorId));
  }
  render();
};

const activateSession = (snapshot) => {
  state.snapshot = snapshot;
  state.resumeCandidate = null;
  state.mode = "workspace";
  state.activeTab = "adjudicate";
  state.flagged = false;
  state.noteOpen = false;
  state.noteDraft = "";
  state.transition = null;
  state.timedCardKey = "";
  persistSnapshot();
};

const resetTransientCardState = () => {
  state.flagged = false;
  state.noteOpen = false;
  state.noteDraft = "";
  state.timedCardKey = "";
};

const getSwipeContext = () => {
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

const ensureCardTimer = (context) => {
  if (!context?.card || state.transition) {
    return;
  }
  const key = `${context.phase}:${context.pass}:${context.card.card_hash}`;
  if (state.timedCardKey !== key) {
    state.timer.start();
    state.timedCardKey = key;
  }
  if (state.noteOpen) {
    state.timer.pause();
  }
};

const decide = (label) => {
  if (
    state.mode !== "workspace" ||
    state.activeTab !== "adjudicate" ||
    state.transition ||
    state.storageError
  ) {
    return;
  }
  const context = getSwipeContext();
  if (!context?.card || context.phase === "qualification-review") {
    return;
  }
  const timestamp = nextSessionTimestamp();
  const event = createSwipeEvent({
    study: state.study,
    annotatorId: state.annotatorId,
    card: context.card,
    pass: context.pass,
    label,
    latencyMs: state.timer.elapsed(),
    flagged: state.flagged,
    note: state.noteDraft,
    rubricVersion: state.snapshot.rubric_version,
    qualification: context.phase === "qualification",
    sessionId: state.snapshot.session_id,
    sequence: state.snapshot.events.length + 1,
    timestamp,
  });
  state.snapshot = {
    ...state.snapshot,
    events: [...state.snapshot.events, event],
  };
  const persisted = persistSnapshot();
  state.transition = {
    card: context.card,
    phase: context.phase,
    pass: context.pass,
    label,
  };
  state.flagged = false;
  state.noteOpen = false;
  state.noteDraft = "";
  state.timedCardKey = "";
  announce(`${LABEL_DETAILS[label].name} recorded.`);
  render();

  if (!persisted) {
    state.transition = null;
    render();
    return;
  }
  const duration = reducedMotion.matches ? 0 : 115;
  window.setTimeout(() => {
    state.transition = null;
    render();
  }, duration);
};

const undoLastSwipe = () => {
  if (!state.snapshot || state.storageError || state.transition) {
    return;
  }
  const context = getSwipeContext();
  const projected = projectSwipes(state.snapshot.events);
  let swipe = null;
  for (let index = projected.length - 1; index >= 0; index -= 1) {
    const candidate = projected[index];
    const samePhase =
      Boolean(candidate.qualification) === (context?.phase === "qualification");
    if (
      candidate.session_id === state.snapshot.session_id &&
      !candidate.retracted &&
      samePhase
    ) {
      swipe = candidate;
      break;
    }
  }
  if (!swipe) {
    announce("Nothing in this session can be undone.");
    return;
  }
  const timestamp = nextSessionTimestamp();
  const retraction = createRetractionEvent({
    swipeId: swipe.swipe_id,
    annotatorId: state.annotatorId,
    sessionId: state.snapshot.session_id,
    timestamp,
  });
  state.snapshot = {
    ...state.snapshot,
    current_pass: swipe.qualification
      ? state.snapshot.current_pass
      : swipe.pass,
    events: [...state.snapshot.events, retraction],
  };
  resetTransientCardState();
  persistSnapshot();
  announce(`${swipe.relation_id} retracted and re-queued.`);
  render();
};

const exportSwipes = () => {
  if (!state.snapshot || !state.study) {
    return;
  }
  const jsonl = swipesToJsonl(state.snapshot.events);
  if (!jsonl) {
    announce("There are no swipes to export yet.");
    return;
  }
  const filename = `swipes-${safeFilenamePart(
    state.study.study_id,
  )}-${safeFilenamePart(state.annotatorId)}.jsonl`;
  downloadText(filename, jsonl, "application/x-ndjson;charset=utf-8");
  state.snapshot = {
    ...state.snapshot,
    exported_event_count: state.snapshot.events.length,
  };
  persistSnapshot();
  announce(`${projectSwipes(state.snapshot.events).length} swipes exported.`);
  render();
};

const startNextPass = () => {
  state.snapshot = {
    ...state.snapshot,
    current_pass: state.snapshot.current_pass + 1,
  };
  resetTransientCardState();
  persistSnapshot();
  render();
};

const completeQualificationReview = () => {
  state.snapshot = {
    ...state.snapshot,
    qualification_reviewed: true,
    current_pass: nextIncompletePass(
      state.study,
      state.annotatorId,
      state.snapshot.events,
    ),
  };
  resetTransientCardState();
  persistSnapshot();
  announce("Qualification complete. Production deck unlocked.");
  render();
};

const renderPublicHeader = (active = "") => `<header class="public-header">
  <button class="wordmark" data-action="home" type="button" aria-label="SALT home">
    <span>SALT</span> swipe adjudicator
  </button>
  <nav aria-label="Tool modes">
    <button class="${active === "builder" ? "is-active" : ""}" data-action="builder" type="button">Study builder</button>
    <button class="${active === "merge" ? "is-active" : ""}" data-action="merge" type="button">Merge exports</button>
  </nav>
</header>`;

const renderHome = () => {
  const demoAvailable =
    embeddedPayload.kind === "generic" && embeddedPayload.demo_study;
  return `${renderPublicHeader()}
  <main class="home-view" id="main-content">
    <section class="home-intro">
      <p class="system-label">Offline relation evidence</p>
      <h1>One file in. Independent judgments out.</h1>
      <p class="lede">Build a reproducible study, label with the keyboard, and merge append-only evidence without an account or backend.</p>
      <div class="home-actions">
        ${
          demoAvailable
            ? '<button class="button button-primary" data-action="demo" type="button">Open the demo deck <kbd>↵</kbd></button>'
            : ""
        }
        <button class="button" data-action="builder" type="button">Build a study</button>
        <button class="button button-quiet" data-action="merge" type="button">Merge exports</button>
      </div>
    </section>
    <section class="capability-strip" aria-label="Operating guarantees">
      <div><strong>1 HTML</strong><span>CSS, JS, deck, and manifest inline</span></div>
      <div><strong>0 requests</strong><span>No runtime service or account</span></div>
      <div><strong>Crash-safe</strong><span>Every decision stored immediately</span></div>
    </section>
    <section class="trust-note">
      <h2>Distribution recommendation</h2>
      <p>Host the generated HTML at one stable static URL and send each annotator their short code. Sending the file directly also works, but keeping it in one location makes browser resume storage more predictable.</p>
      <p>Codes select an assignment and catch typos. They are not authentication, and qualification answers remain inspectable in an offline bundle.</p>
    </section>
  </main>`;
};

const renderAccess = () => {
  const study = state.study;
  return `${renderPublicHeader()}
  <main class="access-view" id="main-content">
    <section class="access-panel">
      <p class="system-label">Study bundle · ${escapeHtml(study.study_id)}</p>
      <h1>${escapeHtml(study.title)}</h1>
      <p>Enter the short code supplied by the coordinator. Your identity is fixed for this session and every export.</p>
      <dl class="study-facts">
        <div><dt>Production slice</dt><dd>≤ ${formatInteger(
          study.slice_size,
        )} cards</dd></div>
        <div><dt>Coverage target</dt><dd>${study.coverage_target} annotators/card</dd></div>
        <div><dt>Rubric</dt><dd>${escapeHtml(study.rubric_version)}</dd></div>
        <div><dt>Deck hash</dt><dd><code>${escapeHtml(
          study.deck_hash.slice(0, 12),
        )}</code></dd></div>
      </dl>
      <form class="access-form" id="access-form">
        <label for="annotator-code">Annotator code</label>
        <input id="annotator-code" name="code" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" required />
        ${
          state.accessError
            ? `<p class="field-error" id="code-error" role="alert">${escapeHtml(
                state.accessError,
              )}</p>`
            : '<p class="field-help">Eight characters; the hyphen is optional.</p>'
        }
        <button class="button button-primary" type="submit">Continue</button>
      </form>
    </section>
  </main>`;
};

const renderResume = () => {
  const projected = projectSwipes(state.resumeCandidate.events);
  const active = projected.filter((swipe) => !swipe.retracted);
  return `${renderPublicHeader()}
  <main class="access-view" id="main-content">
    <section class="access-panel">
      <p class="system-label">Saved local session found</p>
      <h1>Resume ${escapeHtml(state.annotatorId)}?</h1>
      <p>SALT found a crash-safe session for this exact study and deck.</p>
      <dl class="study-facts">
        <div><dt>Active swipes</dt><dd>${active.length}</dd></div>
        <div><dt>Current pass</dt><dd>${state.resumeCandidate.current_pass}</dd></div>
        <div><dt>Started</dt><dd>${escapeHtml(
          new Date(state.resumeCandidate.session_started_at).toLocaleString(),
        )}</dd></div>
        <div><dt>Unsaved</dt><dd>${Math.max(
          0,
          state.resumeCandidate.events.length -
            state.resumeCandidate.exported_event_count,
        )}</dd></div>
      </dl>
      <div class="button-row">
        <button class="button button-primary" data-action="resume" type="button">Resume session</button>
        <button class="button button-danger-quiet" data-action="restart-request" type="button">Start clean</button>
      </div>
      ${
        state.restartConfirmation
          ? `<div class="inline-confirm" role="alert">
              <p>This deletes the browser's crash buffer for this annotator. Export it first if you need the existing evidence.</p>
              <div class="button-row">
                <button class="button button-danger" data-action="restart-confirm" type="button">Delete and restart</button>
                <button class="button button-quiet" data-action="restart-cancel" type="button">Cancel</button>
              </div>
            </div>`
          : ""
      }
    </section>
  </main>`;
};

const renderTopbar = () => {
  const context = getSwipeContext();
  const passLabel =
    context?.phase === "qualification"
      ? "Qual"
      : `P${state.snapshot.current_pass}`;
  const progress =
    context && context.total > 0
      ? `${context.completed}/${context.total}`
      : "complete";
  const tabs = [
    ["adjudicate", "Adjudicate"],
    ["progress", "Progress"],
    ["merge", "Merge"],
    ...(state.merge.sources.size > 0 ? [["resolve", "Resolve"]] : []),
  ];
  return `<header class="instrument-bar">
    <div class="instrument-identity">
      <span class="brand-mark">SALT</span>
      <span class="bar-divider" aria-hidden="true"></span>
      <span title="${escapeHtml(state.study.title)}">${escapeHtml(
        state.study.title,
      )}</span>
    </div>
    <dl class="session-readouts">
      <div><dt>Annotator</dt><dd>${escapeHtml(state.annotatorId)}</dd></div>
      <div><dt>Deck</dt><dd>${passLabel}</dd></div>
      <div><dt>Progress</dt><dd>${progress}</dd></div>
      <div><dt>Session</dt><dd data-session-clock>${formatDuration(
        currentSessionElapsed(),
      )}</dd></div>
      <div class="${unsavedEventCount() > 0 ? "is-warning" : ""}"><dt>Unsaved</dt><dd>${unsavedEventCount()}</dd></div>
    </dl>
    <nav class="workspace-tabs" aria-label="Workspace views" role="tablist">
      ${tabs
        .map(
          ([id, label]) =>
            `<button role="tab" aria-selected="${
              state.activeTab === id
            }" class="${state.activeTab === id ? "is-active" : ""}" data-tab="${id}" type="button">${label}</button>`,
        )
        .join("")}
    </nav>
    <div class="bar-actions">
      <button class="text-button" data-action="rubric-open" type="button">Rubric ${escapeHtml(
        state.snapshot.rubric_version,
      )}</button>
      <button class="icon-text-button" data-action="export-swipes" type="button" title="Export all swipes">Export</button>
      <button class="icon-text-button" data-action="end-session" type="button" title="Leave this session">Exit</button>
    </div>
  </header>
  <dialog class="rubric-dialog" id="rubric-dialog">
    <form id="rubric-form">
      <p class="system-label">Recorded metadata change</p>
      <h2>Change rubric version?</h2>
      <p>Existing swipes keep their original version. Only subsequent swipes receive the new value.</p>
      <label for="rubric-version">Rubric version</label>
      <input id="rubric-version" name="rubric" value="${escapeHtml(
        state.snapshot.rubric_version,
      )}" required />
      <div class="button-row">
        <button class="button button-primary" type="submit">Confirm change</button>
        <button class="button button-quiet" data-action="rubric-cancel" type="button">Cancel</button>
      </div>
    </form>
  </dialog>`;
};

const renderStorageError = () =>
  state.storageError
    ? `<div class="storage-blocker" role="alert">
        <strong>Persistence stopped</strong>
        <p>${escapeHtml(state.storageError)}</p>
        <button class="button" data-action="export-swipes" type="button">Export current evidence</button>
      </div>`
    : "";

const decisionZone = (label, position) => {
  const detail = LABEL_DETAILS[label];
  return `<button class="decision-zone zone-${position} label-${label.toLowerCase()}" data-label="${label}" type="button" aria-label="${detail.name}, ${detail.direction}, ${label}">
    <span aria-hidden="true">${detail.arrow}</span>
    <strong>${detail.name}</strong>
    <kbd>${label}</kbd>
  </button>`;
};

const renderQualificationReview = () => {
  const qualificationSwipes = activeSwipes(state.snapshot.events).filter(
    (swipe) => swipe.qualification && swipe.annotator_id === state.annotatorId,
  );
  const swipeByRelation = new Map(
    qualificationSwipes.map((swipe) => [swipe.relation_id, swipe]),
  );
  const missed = state.study.qualification_cards.filter(
    (card) => swipeByRelation.get(card.relation_id)?.label !== card.answer,
  );
  return `${renderTopbar()}
  <main class="review-view" id="main-content">
    <header class="view-heading">
      <p class="system-label">Qualification complete · ${qualificationSwipes.length}/${state.study.qualification_cards.length}</p>
      <h1>${missed.length === 0 ? "Calibration matched every anchor." : `${missed.length} anchor${missed.length === 1 ? "" : "s"} to review.`}</h1>
      <p>Answers were hidden until the full deck was complete. Qualification swipes remain marked and are excluded from gold aggregation.</p>
    </header>
    ${
      missed.length === 0
        ? '<div class="notice notice-success"><strong>No corrections needed.</strong><p>Continue when you are ready for the production slice.</p></div>'
        : `<ol class="missed-list">${missed
            .map((card) => {
              const swipe = swipeByRelation.get(card.relation_id);
              return `<li>
                <div class="missed-result">
                  <code>${escapeHtml(card.relation_id)}</code>
                  <span>Your label <strong class="label-text label-${swipe.label.toLowerCase()}">${swipe.label} · ${LABEL_DETAILS[swipe.label].name}</strong></span>
                  <span>Anchor <strong class="label-text label-${card.answer.toLowerCase()}">${card.answer} · ${LABEL_DETAILS[card.answer].name}</strong></span>
                </div>
                <pre>${escapeHtml(card.card_text)}</pre>
                <p>${escapeHtml(card.rationale)}</p>
              </li>`;
            })
            .join("")}</ol>`
    }
    <button class="button button-primary" data-action="qualification-continue" type="button">Continue to production</button>
  </main>`;
};

const renderPassComplete = (context) => {
  const isTargeted = context.pass >= 4;
  const active = activeSwipes(state.snapshot.events).filter(
    (swipe) =>
      !swipe.qualification &&
      swipe.annotator_id === state.annotatorId &&
      swipe.pass === context.pass,
  );
  return `${renderTopbar()}
  <main class="completion-view" id="main-content">
    <div class="completion-signal" aria-hidden="true">✓</div>
    <p class="system-label">${isTargeted ? "Targeted pass" : "Production pass"} ${context.pass}</p>
    <h1>${isTargeted && active.length === 0 ? "No local disagreements need another pass." : "Pass complete."}</h1>
    <p>${active.length} active swipe${active.length === 1 ? "" : "s"} recorded. Export now; the downloaded JSONL is the system of record.</p>
    <div class="completion-actions">
      <button class="button button-primary" data-action="export-swipes" type="button">Export swipes.jsonl</button>
      <button class="button" data-action="next-pass" type="button">Start pass ${
        context.pass + 1
      }${context.pass + 1 >= 4 ? " · targeted" : ""}</button>
      <button class="button button-quiet" data-tab="progress" type="button">Review progress</button>
    </div>
  </main>`;
};

const renderSwipe = () => {
  const context = getSwipeContext();
  if (context.phase === "qualification-review") {
    return renderQualificationReview();
  }
  if (!context.card) {
    return renderPassComplete(context);
  }

  ensureCardTimer(context);
  const displayCard = state.transition?.card ?? context.card;
  const displayPhase = state.transition?.phase ?? context.phase;
  const displayPass = state.transition?.pass ?? context.pass;
  const renderedText = shuffleCardText(
    displayCard.card_text,
    exampleSeedFor(state.study, state.annotatorId, displayPass, displayCard),
  );
  const progressValue =
    context.total === 0 ? 1 : context.completed / context.total;
  const exitClass = state.transition
    ? `is-exiting exit-${state.transition.label.toLowerCase()}`
    : "";

  return `${renderTopbar()}
  ${renderStorageError()}
  <main class="swipe-view ${displayPhase === "qualification" ? "is-qualification" : ""}" id="main-content">
    <div class="swipe-mode-banner">
      <span>${displayPhase === "qualification" ? "Qualification · answers reveal after completion" : displayPass >= 4 ? "Targeted mode · prior local disagreement or U only" : `Production pass ${displayPass}`}</span>
      <span>${context.completed} / ${context.total}</span>
      <progress value="${progressValue}" max="1">${formatPercent(
        progressValue,
      )}</progress>
    </div>
    ${decisionZone("C", "top")}
    ${decisionZone("P", "right")}
    ${decisionZone("O", "left")}
    ${decisionZone("U", "bottom")}
    <section class="relation-stage" aria-label="Current relation">
      <article class="relation-card ${exitClass}" data-swipe-card>
        <div class="card-meta">
          <span>${escapeHtml(displayCard.relation_id)}</span>
          <span>${escapeHtml(displayCard.family_id)}</span>
          <span>${displayCard.prescreen === "equivalence" ? "Coincident prescreen" : "Normal prescreen"}</span>
        </div>
        <pre>${escapeHtml(renderedText)}</pre>
      </article>
      ${
        state.noteOpen
          ? `<div class="note-composer">
              <div class="note-heading"><label for="swipe-note">Note <span>timer paused</span></label><span><span data-note-count>${state.noteDraft.length}</span>/280</span></div>
              <input id="swipe-note" maxlength="280" value="${escapeHtml(
                state.noteDraft,
              )}" placeholder="One line of context for downstream review" autocomplete="off" />
              <div class="note-help"><span><kbd>Enter</kbd> keep note</span><button class="text-button" data-action="note-cancel" type="button">Clear and close <kbd>Esc</kbd></button></div>
            </div>`
          : ""
      }
    </section>
    <footer class="swipe-actions">
      <button class="${state.flagged ? "is-active" : ""}" data-action="flag" type="button" aria-pressed="${state.flagged}"><kbd>F</kbd><span>${state.flagged ? "Flagged" : "Flag"}</span></button>
      <button class="${state.noteOpen ? "is-active" : ""}" data-action="note" type="button" aria-pressed="${state.noteOpen}"><kbd>N</kbd><span>Note</span></button>
      <span class="action-spacer"></span>
      <button data-action="undo" type="button"><kbd>Z</kbd><span>Undo</span></button>
      <button data-action="export-swipes" type="button"><span>Export</span><kbd>E</kbd></button>
    </footer>
  </main>`;
};

const passProgressRows = (productionSwipes, assignedCount) => {
  const passNumbers = [
    ...new Set(productionSwipes.map((swipe) => swipe.pass)),
    state.snapshot.current_pass,
  ].sort((left, right) => left - right);
  return passNumbers
    .map((pass) => {
      const count = productionSwipes.filter(
        (swipe) => swipe.pass === pass,
      ).length;
      const targeted =
        pass >= 4
          ? new Set(
              productionSwipes
                .filter((swipe) => swipe.pass === pass)
                .map((swipe) => swipe.relation_id),
            ).size
          : assignedCount;
      const denominator = Math.max(targeted, count, 1);
      return `<div class="progress-row">
        <span>Pass ${pass}${pass >= 4 ? " · targeted" : ""}</span>
        <progress value="${count}" max="${denominator}">${count}/${denominator}</progress>
        <strong>${count} / ${denominator}</strong>
      </div>`;
    })
    .join("");
};

const noiseFloorRows = (productionSwipes) => {
  const passes = [...new Set(productionSwipes.map((swipe) => swipe.pass))].sort(
    (left, right) => left - right,
  );
  return passes
    .map((throughPass) => {
      const summaries = relationSummaries(
        productionSwipes.filter((swipe) => swipe.pass <= throughPass),
        state.study.cards,
      ).filter((summary) => summary.labels.length > 0);
      const unanimous = summaries.filter((summary) => summary.unanimous).length;
      return `<tr><th scope="row">Through pass ${throughPass}</th><td>${unanimous} / ${summaries.length}</td><td>${formatPercent(
        summaries.length === 0 ? null : unanimous / summaries.length,
        1,
      )}</td></tr>`;
    })
    .join("");
};

const renderDistribution = (
  summary,
) => `<div class="distribution" aria-label="${escapeHtml(
  summary.relation_id,
)} label distribution">
  ${LABELS.map((label) => {
    const width =
      summary.labels.length === 0
        ? 0
        : (summary.counts[label] / summary.labels.length) * 100;
    return `<span class="label-${label.toLowerCase()}" style="--share:${width}%" title="${LABEL_DETAILS[label].name}: ${summary.counts[label]}"></span>`;
  }).join("")}
</div>`;

const renderProgress = () => {
  const productionSwipes = activeSwipes(state.snapshot.events).filter(
    (swipe) => !swipe.qualification && swipe.annotator_id === state.annotatorId,
  );
  const context = getSwipeContext();
  const passActive =
    context.phase === "production" && context.remaining.length > 0;
  const assignedCount =
    state.study.manifest.assignments[state.annotatorId]?.length ?? 0;
  const sessionMinutes = currentSessionElapsed() / 60_000;
  const pace =
    sessionMinutes <= 0 ? 0 : productionSwipes.length / sessionMinutes;
  const summaries = relationSummaries(productionSwipes, state.study.cards);
  const equivalenceSummaries = summaries.filter(
    (summary) =>
      summary.card?.prescreen === "equivalence" && summary.labels.length > 0,
  );
  const coincidentCount = equivalenceSummaries.filter(
    (summary) => summary.majority === "C",
  ).length;
  const disagreementRows = summaries
    .filter((summary) => summary.entropy > 0 || summary.labels.includes("U"))
    .slice(0, 100);

  return `${renderTopbar()}
  <main class="analysis-view" id="main-content">
    <header class="view-heading">
      <p class="system-label">Local evidence · ${escapeHtml(
        state.annotatorId,
      )}</p>
      <h1>Progress and analysis</h1>
      <p>Session metrics are local to this annotator. Cross-annotator agreement appears in Merge.</p>
    </header>
    <section class="metric-line" aria-label="Session summary">
      <div><span>Production swipes</span><strong>${formatInteger(
        productionSwipes.length,
      )}</strong></div>
      <div><span>Swipes / minute</span><strong>${pace.toFixed(1)}</strong></div>
      <div><span>Session time</span><strong>${formatDuration(
        currentSessionElapsed(),
      )}</strong></div>
      <div><span>Unsaved changes</span><strong>${unsavedEventCount()}</strong></div>
    </section>
    <section class="analysis-section">
      <div class="section-heading"><h2>Pass completion</h2><span>${assignedCount} assigned relations</span></div>
      <div class="pass-progress">${passProgressRows(
        productionSwipes,
        assignedCount,
      )}</div>
    </section>
    ${
      passActive
        ? `<section class="blind-analysis-lock">
            <span aria-hidden="true">⊘</span>
            <div><h2>Label analysis is blind while this pass is active.</h2><p>Completion and pace remain visible. Distributions, majority labels, notes, and the Coincident quota unlock when the current pass is complete.</p></div>
          </section>`
        : `<section class="analysis-grid">
            <div class="analysis-section">
              <div class="section-heading"><h2>Noise floor</h2><span>Unanimous relations</span></div>
              <table><thead><tr><th>Evidence</th><th>Unanimous</th><th>Fraction</th></tr></thead><tbody>${noiseFloorRows(
                productionSwipes,
              )}</tbody></table>
            </div>
            <div class="analysis-section quota-panel">
              <div class="section-heading"><h2>Coincident quota</h2><span>Prescreen = equivalence</span></div>
              <strong>${coincidentCount} / ${state.study.coincident_target}</strong>
              <progress value="${coincidentCount}" max="${
                state.study.coincident_target
              }">${coincidentCount}/${state.study.coincident_target}</progress>
              <p>The 0.98 LCB gate is unpassable below roughly 150 zero-error cases.</p>
            </div>
          </section>
          <section class="analysis-section">
            <div class="section-heading"><h2>Disagreement queue</h2><span>${disagreementRows.length} shown · sorted by entropy</span></div>
            ${
              disagreementRows.length === 0
                ? '<div class="empty-inline"><strong>No local disagreements yet.</strong><span>Relations with differing pass labels or any U will appear here.</span></div>'
                : `<div class="data-table-wrap"><table class="data-table">
                    <thead><tr><th>Relation</th><th>Distribution</th><th>Sequence</th><th>Entropy</th><th>Majority</th></tr></thead>
                    <tbody>${disagreementRows
                      .map(
                        (summary) => `<tr>
                          <th scope="row">${escapeHtml(
                            summary.relation_id,
                          )}</th>
                          <td>${renderDistribution(summary)}</td>
                          <td class="label-sequence">${summary.labels
                            .map(
                              (label) =>
                                `<span class="label-${label.toLowerCase()}">${label}</span>`,
                            )
                            .join("")}</td>
                          <td>${summary.entropy.toFixed(3)}</td>
                          <td>${
                            summary.majority
                              ? `${summary.majority} · ${LABEL_DETAILS[summary.majority].name}`
                              : "Tie"
                          }</td>
                        </tr>`,
                      )
                      .join("")}</tbody>
                  </table></div>`
            }
            <button class="button" data-action="export-local-edge-table" type="button">Export edge-case markdown</button>
          </section>`
    }
    <aside class="throughput-note">
      <strong>Throughput, not a promise</strong>
      <span>At 8–15 seconds/card: 30 cards × 3 passes is about 20 minutes; 400 cards × 3 passes is roughly 3–5 hours across sessions.</span>
    </aside>
  </main>`;
};

const dropZone = (kind, label, filename, accept, multiple = false) => `
  <label class="drop-zone ${filename ? "has-file" : ""}" data-drop-kind="${kind}">
    <input type="file" data-file-kind="${kind}" accept="${accept}" ${
      multiple ? "multiple" : ""
    } />
    <span class="drop-icon" aria-hidden="true">${filename ? "✓" : "↓"}</span>
    <strong>${filename ? escapeHtml(filename) : escapeHtml(label)}</strong>
    <span>${filename ? "Loaded · choose another file to replace" : "Drop here or choose a file"}</span>
  </label>`;

const renderBuilder = () => {
  const result = state.builder.result;
  return `${renderPublicHeader("builder")}
  <main class="builder-view" id="main-content">
    <header class="view-heading">
      <p class="system-label">Coordinator mode</p>
      <h1>Build one reproducible study bundle.</h1>
      <p>The output HTML contains the deck, assignment manifest, qualification answers, and the full application. Annotators receive that file and one short code.</p>
    </header>
    <form class="builder-form" id="builder-form">
      <section class="builder-files">
        ${dropZone(
          "cards",
          "Production cards.jsonl",
          state.builder.cardsName,
          ".jsonl,application/x-ndjson,application/json",
        )}
        ${dropZone(
          "qualification",
          "Qualification JSONL · optional",
          state.builder.qualificationName,
          ".jsonl,application/x-ndjson,application/json",
        )}
      </section>
      <section class="form-section">
        <div class="section-heading"><h2>Study identity</h2><span>Embedded in every export</span></div>
        <div class="form-grid">
          <label class="field field-wide">Study title
            <input name="title" value="SALT geometry adjudication" required />
          </label>
          <label class="field">Rubric version
            <input name="rubric" value="v0.3" required />
          </label>
          <label class="field">Study seed
            <input name="seed" value="salt-gold-v1" required spellcheck="false" />
          </label>
        </div>
      </section>
      <section class="form-section">
        <div class="section-heading"><h2>Assignments</h2><span>One opaque ID per line</span></div>
        <div class="assignment-fields">
          <label class="field field-roster">Annotator IDs
            <textarea name="roster" rows="8" placeholder="annotator-01&#10;annotator-02&#10;annotator-03" required></textarea>
          </label>
          <div class="form-grid compact">
            <label class="field">Coverage / card
              <input name="coverage" type="number" min="1" step="1" value="2" required />
            </label>
            <label class="field">Slice cap / annotator
              <input name="slice" type="number" min="1" step="1" value="150" required />
            </label>
            <label class="field">Coincident target
              <input name="quota" type="number" min="1" step="1" value="300" required />
            </label>
          </div>
        </div>
      </section>
      ${renderIssues(state.builder.error)}
      <div class="form-actions">
        <button class="button button-primary" type="submit">Generate study</button>
        <button class="button button-quiet" data-action="builder-clear" type="button">Clear imported data</button>
      </div>
    </form>
    ${
      result
        ? `<section class="build-result" aria-live="polite">
            <div class="build-result-heading">
              <div><p class="system-label">Bundle ready</p><h2>${escapeHtml(
                result.study.study_id,
              )}</h2></div>
              <code>${escapeHtml(result.study.deck_hash.slice(0, 16))}</code>
            </div>
            <dl class="result-facts">
              <div><dt>Production cards</dt><dd>${
                result.study.cards.length
              }</dd></div>
              <div><dt>Qualification cards</dt><dd>${
                result.study.qualification_cards.length
              }</dd></div>
              <div><dt>Annotators</dt><dd>${
                result.study.manifest.annotator_ids.length
              }</dd></div>
              <div><dt>Load range</dt><dd>${Math.min(
                ...Object.values(result.study.manifest.loads),
              )}–${Math.max(
                ...Object.values(result.study.manifest.loads),
              )}</dd></div>
            </dl>
            <div class="download-stack">
              <button class="button button-primary" data-action="download-study" type="button">Download study HTML</button>
              <button class="button" data-action="download-codes" type="button">Download private code sheet TSV</button>
              <button class="button" data-action="download-manifest" type="button">Download verification manifest JSON</button>
            </div>
            <p class="result-warning">Send annotators only the HTML and their individual code. Keep the full code sheet private to avoid accidental identity collisions.</p>
          </section>`
        : ""
    }
  </main>`;
};

const deduplicatedMergedSwipes = () => {
  const byId = new Map();
  for (const swipes of state.merge.sources.values()) {
    for (const swipe of swipes) {
      const id =
        swipe.swipe_id ??
        [
          swipe.study_id,
          swipe.annotator_id,
          swipe.relation_id,
          swipe.pass,
          swipe.ts,
        ].join(":");
      const existing = byId.get(id);
      if (!existing || (!existing.retracted && swipe.retracted)) {
        byId.set(id, swipe);
      }
    }
  }
  return [...byId.values()];
};

const mergeStudy = (swipes = deduplicatedMergedSwipes()) => {
  const studyIds = new Set(
    swipes.map((swipe) => swipe.study_id).filter(Boolean),
  );
  const candidate = activeStudy();
  if (candidate && (studyIds.size === 0 || studyIds.has(candidate.study_id))) {
    return candidate;
  }
  const importedManifest = state.merge.manifest;
  if (
    importedManifest?.manifest &&
    (studyIds.size === 0 || studyIds.has(importedManifest.study_id))
  ) {
    return {
      ...importedManifest,
      cards: importedManifest.cards ?? [],
    };
  }
  return null;
};

const computeMerge = () => {
  const swipes = deduplicatedMergedSwipes();
  const latest = latestVotesByAnnotator(swipes);
  const study = mergeStudy(swipes);
  const cards = study?.cards ?? [];
  const summaries = relationSummaries(latest, cards).filter(
    (summary) => summary.labels.length > 0,
  );
  const agreement = agreementStatistics(swipes);
  const studyIds = [
    ...new Set(swipes.map((swipe) => swipe.study_id).filter(Boolean)),
  ];
  const deckHashes = [
    ...new Set(swipes.map((swipe) => swipe.deck_hash).filter(Boolean)),
  ];
  const rubricVersions = [
    ...new Set(swipes.map((swipe) => swipe.rubric_version).filter(Boolean)),
  ];
  const coverage = study ? summarizeCoverage(study, swipes) : null;
  return {
    swipes,
    latest,
    study,
    summaries,
    agreement,
    studyIds,
    deckHashes,
    rubricVersions,
    coverage,
  };
};

const renderMergeWarnings = (merge) => {
  const warnings = [];
  const verificationSource =
    embeddedPayload.kind === "study" ? state.study : state.merge.manifest;
  if (merge.studyIds.length > 1) {
    warnings.push(
      `Exports contain ${merge.studyIds.length} different study IDs.`,
    );
  }
  if (merge.deckHashes.length > 1) {
    warnings.push(
      `Exports contain ${merge.deckHashes.length} different deck hashes.`,
    );
  }
  if (merge.rubricVersions.length > 1) {
    warnings.push(
      `Evidence spans rubric versions: ${merge.rubricVersions.join(", ")}.`,
    );
  }
  if (
    verificationSource?.study_id &&
    merge.studyIds.some((studyId) => studyId !== verificationSource.study_id)
  ) {
    warnings.push(
      `At least one export does not match verification study ${verificationSource.study_id}.`,
    );
  }
  if (
    verificationSource?.deck_hash &&
    merge.deckHashes.some(
      (deckHash) => deckHash !== verificationSource.deck_hash,
    )
  ) {
    warnings.push(
      "At least one export does not match the verification deck hash.",
    );
  }
  if (merge.study?.cards?.length > 0) {
    const expectedHashes = new Map(
      merge.study.cards.map((card) => [card.relation_id, card.card_hash]),
    );
    const unknownRelations = new Set();
    const mismatchedRelations = new Set();
    for (const swipe of merge.swipes) {
      const expectedHash = expectedHashes.get(swipe.relation_id);
      if (!expectedHash) {
        unknownRelations.add(swipe.relation_id);
      } else if (expectedHash !== swipe.card_hash) {
        mismatchedRelations.add(swipe.relation_id);
      }
    }
    if (unknownRelations.size > 0) {
      warnings.push(
        `${unknownRelations.size} relation IDs are absent from the matching manifest.`,
      );
    }
    if (mismatchedRelations.size > 0) {
      warnings.push(
        `${mismatchedRelations.size} relations have card hashes that differ from the matching manifest.`,
      );
    }
  }
  const filesByAnnotator = new Map();
  for (const [filename, swipes] of state.merge.sources) {
    for (const annotatorId of new Set(
      swipes.map((swipe) => swipe.annotator_id),
    )) {
      const files = filesByAnnotator.get(annotatorId) ?? new Set();
      files.add(filename);
      filesByAnnotator.set(annotatorId, files);
    }
  }
  for (const [annotatorId, files] of filesByAnnotator) {
    if (files.size > 1) {
      warnings.push(
        `${annotatorId} appears in ${files.size} files; duplicate swipe IDs were collapsed.`,
      );
    }
  }
  if (warnings.length === 0 && !state.merge.warning) {
    return "";
  }
  return `<div class="notice notice-warning" role="status">
    <strong>Merge notes</strong>
    <ul>${[state.merge.warning, ...warnings]
      .filter(Boolean)
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join("")}</ul>
  </div>`;
};

const renderMerge = () => {
  const merge = computeMerge();
  const hasSession = state.mode === "workspace";
  const header = hasSession ? renderTopbar() : renderPublicHeader("merge");
  const disagreementCount = merge.summaries.filter(
    (summary) => summary.entropy > 0 || summary.labels.includes("U"),
  ).length;
  return `${header}
  <main class="merge-view" id="main-content">
    <header class="view-heading">
      <p class="system-label">Coordinator mode</p>
      <h1>Merge independent evidence.</h1>
      <p>Drop full swipe exports. Duplicate IDs collapse safely; active latest votes drive cross-annotator distributions and agreement.</p>
    </header>
    <section class="merge-imports">
      ${dropZone(
        "swipes",
        "Swipes JSONL · choose multiple",
        "",
        ".jsonl,application/x-ndjson,application/json",
        true,
      )}
      ${dropZone(
        "manifest",
        "Verification manifest · optional",
        state.merge.manifestName,
        ".json,application/json",
      )}
      ${dropZone(
        "adjudications",
        "Existing adjudications · optional",
        state.merge.adjudications.length > 0
          ? `${state.merge.adjudications.length} adjudications`
          : "",
        ".jsonl,application/x-ndjson,application/json",
      )}
    </section>
    ${
      state.merge.sources.size > 0
        ? `<div class="file-chips" aria-label="Loaded swipe files">${[
            ...state.merge.sources.entries(),
          ]
            .map(
              ([filename, swipes]) =>
                `<span><strong>${escapeHtml(filename)}</strong>${swipes.length} lines<button data-action="remove-merge-source" data-filename="${escapeHtml(
                  filename,
                )}" type="button" aria-label="Remove ${escapeHtml(
                  filename,
                )}">×</button></span>`,
            )
            .join("")}</div>`
        : ""
    }
    ${renderIssues(state.merge.error)}
    ${renderMergeWarnings(merge)}
    ${
      merge.swipes.length === 0
        ? `<section class="merge-empty">
            <div aria-hidden="true">↳</div>
            <h2>No evidence loaded.</h2>
            <p>Each export may be dropped again after later sessions; stable swipe IDs prevent double counting.</p>
          </section>`
        : `<section class="metric-line merge-metrics" aria-label="Merged evidence summary">
            <div><span>Exported swipe lines</span><strong>${formatInteger(
              merge.swipes.length,
            )}</strong></div>
            <div><span>Active latest votes</span><strong>${formatInteger(
              merge.latest.length,
            )}</strong></div>
            <div><span>Annotators</span><strong>${
              merge.agreement.annotatorIds.length
            }</strong></div>
            <div><span>Relations in disagreement</span><strong>${disagreementCount}</strong></div>
          </section>
          <section class="analysis-grid merge-analysis-grid">
            <div class="analysis-section alpha-panel">
              <div class="section-heading"><h2>Krippendorff’s alpha</h2><span>Nominal · latest active vote</span></div>
              <strong>${formatAlpha(merge.agreement.overall)}</strong>
              <dl>${LABELS.map(
                (label) =>
                  `<div><dt>${label} vs rest</dt><dd>${formatAlpha(
                    merge.agreement.by_class[label],
                  )}</dd></div>`,
              ).join("")}</dl>
            </div>
            <div class="analysis-section coverage-panel">
              <div class="section-heading"><h2>Manifest coverage</h2><span>${
                merge.study
                  ? escapeHtml(merge.study.study_id)
                  : "No matching manifest"
              }</span></div>
              ${
                merge.coverage
                  ? `<strong>${merge.coverage.complete} / ${merge.coverage.total}</strong>
                    <progress value="${merge.coverage.complete}" max="${merge.coverage.total}">${merge.coverage.complete}/${merge.coverage.total}</progress>
                    <p>${merge.coverage.rows.filter((row) => row.observed < row.expected).length} relations remain below ${merge.study.coverage_target}× coverage.</p>`
                  : "<p>Open the matching study bundle or load its exported manifest to verify planned coverage.</p>"
              }
            </div>
          </section>
          <section class="analysis-section">
            <div class="section-heading"><h2>Cross-annotator distributions</h2><span>${merge.summaries.length} relations · entropy order</span></div>
            <div class="data-table-wrap"><table class="data-table">
              <thead><tr><th>Relation</th><th>Votes</th><th>Distribution</th><th>Sequence</th><th>Entropy</th><th>Majority</th></tr></thead>
              <tbody>${merge.summaries
                .slice(0, 500)
                .map(
                  (summary) => `<tr>
                    <th scope="row">${escapeHtml(summary.relation_id)}</th>
                    <td>${summary.labels.length}</td>
                    <td>${renderDistribution(summary)}</td>
                    <td class="label-sequence">${summary.labels
                      .map(
                        (label) =>
                          `<span class="label-${label.toLowerCase()}">${label}</span>`,
                      )
                      .join("")}</td>
                    <td>${summary.entropy.toFixed(3)}</td>
                    <td>${
                      summary.majority
                        ? `${summary.majority} · ${LABEL_DETAILS[summary.majority].name}`
                        : "Tie"
                    }</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table></div>
            <div class="button-row">
              <button class="button button-primary" data-action="start-resolve" type="button" ${
                disagreementCount === 0 ? "disabled" : ""
              }>Resolve ${disagreementCount} edge cases</button>
              <button class="button" data-action="export-merge-edge-table" type="button">Export edge-case markdown</button>
            </div>
          </section>`
    }
  </main>`;
};

const adjudicationStorageKey = (studyId) =>
  `salt:adjudications:${studyId || "unscoped"}`;

const saveAdjudications = (studyId) => {
  try {
    localStorage.setItem(
      adjudicationStorageKey(studyId),
      JSON.stringify(state.merge.adjudications),
    );
  } catch (error) {
    state.adjudicationError = `Adjudication saved in memory but not browser storage: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
};

const loadSavedAdjudications = (studyId) => {
  try {
    const serialized = localStorage.getItem(adjudicationStorageKey(studyId));
    if (!serialized) {
      return;
    }
    const records = JSON.parse(serialized);
    const known = new Set(
      state.merge.adjudications.map(
        (record) => `${record.relation_id}:${record.ts}`,
      ),
    );
    state.merge.adjudications = [
      ...state.merge.adjudications,
      ...records.filter(
        (record) => !known.has(`${record.relation_id}:${record.ts}`),
      ),
    ];
  } catch {
    // An optional prior adjudication buffer should not block a fresh merge.
  }
};

const renderResolve = () => {
  const merge = computeMerge();
  const resolvedIds = new Set(
    state.merge.adjudications.map((record) => record.relation_id),
  );
  const queue = merge.summaries.filter(
    (summary) =>
      (summary.entropy > 0 || summary.labels.includes("U")) &&
      !resolvedIds.has(summary.relation_id),
  );
  const current = queue[0] ?? null;
  const agreements = perAnnotatorGoldAgreement(
    merge.swipes,
    state.merge.adjudications,
  );
  return `${state.mode === "workspace" ? renderTopbar() : renderPublicHeader("merge")}
  <main class="resolve-view" id="main-content">
    <header class="view-heading resolve-heading">
      <div><p class="system-label">Binding adjudication</p><h1>Resolve the highest-entropy evidence.</h1></div>
      <dl><div><dt>Remaining</dt><dd>${queue.length}</dd></div><div><dt>Resolved</dt><dd>${state.merge.adjudications.length}</dd></div></dl>
    </header>
    ${renderIssues(state.adjudicationError ? new Error(state.adjudicationError) : null)}
    ${
      !current
        ? `<section class="completion-view embedded">
            <div class="completion-signal" aria-hidden="true">✓</div>
            <h2>Adjudication queue complete.</h2>
            <p>Export the binding records and refreshed edge-case table.</p>
            <div class="button-row">
              <button class="button button-primary" data-action="export-adjudications" type="button" ${
                state.merge.adjudications.length === 0 ? "disabled" : ""
              }>Export adjudications JSONL</button>
              <button class="button" data-action="export-merge-edge-table" type="button">Export edge-case markdown</button>
            </div>
          </section>`
        : `<section class="resolve-layout">
            <article class="resolve-card">
              <div class="resolve-card-meta">
                <code>${escapeHtml(current.relation_id)}</code>
                <span>Entropy ${current.entropy.toFixed(3)}</span>
                <span>${current.labels.length} votes</span>
              </div>
              <pre>${escapeHtml(
                current.card?.card_text ??
                  `Relation: ${current.relation_id}\nCard text is not present in the loaded exports.`,
              )}</pre>
              <div class="evidence-sequence" aria-label="Label evidence">
                ${current.swipes
                  .map(
                    (swipe) =>
                      `<span class="label-${swipe.label.toLowerCase()}"><strong>${swipe.label}</strong>${escapeHtml(
                        swipe.annotator_id,
                      )} · p${swipe.pass}</span>`,
                  )
                  .join("")}
              </div>
              ${
                current.notes.length > 0
                  ? `<div class="evidence-notes"><h2>Annotator notes</h2>${current.notes
                      .map(
                        (note) =>
                          `<blockquote><p>${escapeHtml(
                            note.note,
                          )}</p><cite>${escapeHtml(
                            note.annotator_id,
                          )} · pass ${note.pass}</cite></blockquote>`,
                      )
                      .join("")}</div>`
                  : ""
              }
            </article>
            <form class="resolve-form" id="resolve-form">
              <div><p class="system-label">Binding record</p><h2>Select the final class.</h2></div>
              <fieldset class="label-choice"><legend>Adjudicated label</legend>
                ${LABELS.map(
                  (label) =>
                    `<button class="label-${label.toLowerCase()}" type="submit" name="label" value="${label}"><span>${LABEL_DETAILS[label].arrow}</span><strong>${LABEL_DETAILS[label].name}</strong><kbd>${label}</kbd></button>`,
                ).join("")}
              </fieldset>
              <label class="field">One-line rationale
                <textarea name="rationale" rows="4" maxlength="500" required placeholder="Why this class is binding for the relation"></textarea>
              </label>
              <label class="field">Adjudicator ID
                <input name="adjudicator" required autocomplete="off" />
              </label>
              <p class="field-help">Choose a class button to save and advance. Adjudications never mix with swipe records.</p>
            </form>
          </section>`
    }
    ${
      agreements.length > 0
        ? `<section class="analysis-section">
            <div class="section-heading"><h2>Agreement with adjudicated gold</h2><span>${state.merge.adjudications.length} binding records</span></div>
            <table><thead><tr><th>Annotator</th><th>Matches</th><th>Agreement</th></tr></thead><tbody>${agreements
              .map(
                (entry) =>
                  `<tr><th scope="row">${escapeHtml(
                    entry.annotator_id,
                  )}</th><td>${entry.matching} / ${
                    entry.total
                  }</td><td>${formatPercent(entry.agreement, 1)}</td></tr>`,
              )
              .join("")}</tbody></table>
          </section>`
        : ""
    }
  </main>`;
};

const renderFatal = () => `${renderPublicHeader()}
  <main class="fatal-view" id="main-content">
    <p class="system-label">SALT stopped safely</p>
    <h1>Evidence cannot be collected in this state.</h1>
    <p>${escapeHtml(state.fatalError)}</p>
    <button class="button" data-action="home" type="button">Return home</button>
  </main>`;

const render = () => {
  if (state.fatalError) {
    appElement.innerHTML = renderFatal();
    return;
  }

  if (state.mode === "home") {
    appElement.innerHTML = renderHome();
  } else if (state.mode === "access") {
    appElement.innerHTML = renderAccess();
  } else if (state.mode === "resume") {
    appElement.innerHTML = renderResume();
  } else if (state.mode === "builder") {
    appElement.innerHTML = renderBuilder();
  } else if (state.mode === "merge") {
    appElement.innerHTML = renderMerge();
  } else if (state.mode === "resolve") {
    appElement.innerHTML = renderResolve();
  } else if (state.mode === "workspace") {
    if (state.activeTab === "adjudicate") {
      appElement.innerHTML = renderSwipe();
    } else if (state.activeTab === "progress") {
      appElement.innerHTML = renderProgress();
    } else if (state.activeTab === "merge") {
      appElement.innerHTML = renderMerge();
    } else {
      appElement.innerHTML = renderResolve();
    }
  }

  if (state.noteOpen) {
    window.requestAnimationFrame(() => {
      const noteInput = document.querySelector("#swipe-note");
      noteInput?.focus();
      noteInput?.setSelectionRange(
        noteInput.value.length,
        noteInput.value.length,
      );
    });
  }
};

const openHome = () => {
  if (embeddedPayload.kind === "study") {
    state.mode = "access";
    state.study = embeddedPayload.study;
  } else {
    state.mode = "home";
    state.study = null;
  }
  state.snapshot = null;
  state.annotatorId = null;
  state.repository = null;
  state.resumeCandidate = null;
  state.restartConfirmation = false;
  state.storageError = "";
  render();
};

const buildStudyHtml = (study) => {
  if (
    document.querySelector('script[src], link[rel="stylesheet"][href]') ||
    document.querySelector('script[type="module"]')
  ) {
    throw new SaltValidationError(
      "Study HTML can only be exported from the built salt-adjudicator.html artifact. Run node build.mjs first.",
    );
  }
  const clone = document.documentElement.cloneNode(true);
  const clonedApp = clone.querySelector("#app");
  clonedApp.innerHTML = `<main class="boot-state" id="main-content"><p>SALT is loading…</p></main>`;
  clone.querySelector("#live-region").textContent = "";
  clone.querySelector("#salt-study").textContent = serializePayload({
    kind: "study",
    study,
  });
  return `<!doctype html>\n${clone.outerHTML}`;
};

const loadBuilderFile = async (kind, file) => {
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    if (kind === "cards") {
      state.builder.cards = parseCardsJsonl(text);
      state.builder.cardsName = file.name;
    } else {
      state.builder.qualificationCards = parseCardsJsonl(text, {
        qualification: true,
      });
      state.builder.qualificationName = file.name;
    }
    state.builder.error = null;
    state.builder.result = null;
  } catch (error) {
    state.builder.error = error;
  }
  render();
};

const loadMergeFiles = async (files) => {
  try {
    for (const file of files) {
      const text = await file.text();
      state.merge.sources.set(file.name, parseSwipesJsonl(text, file.name));
    }
    state.merge.error = null;
    state.merge.warning = "";
  } catch (error) {
    state.merge.error = error;
  }
  render();
};

const loadManifestFile = async (file) => {
  if (!file) {
    return;
  }
  try {
    state.merge.manifest = JSON.parse(await file.text());
    state.merge.manifestName = file.name;
    state.merge.error = null;
    if (!activeStudy() && state.merge.manifest?.manifest) {
      state.merge.warning =
        "Manifest metadata loaded. Card text is unavailable outside its study bundle, but planned coverage can still be inspected downstream.";
    }
  } catch (error) {
    state.merge.error = new SaltValidationError(
      `Could not load ${file.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  render();
};

const loadAdjudicationFile = async (file) => {
  if (!file) {
    return;
  }
  try {
    const records = parseAdjudicationsJsonl(await file.text(), file.name);
    const byKey = new Map(
      [...state.merge.adjudications, ...records].map((record) => [
        `${record.relation_id}:${record.ts}`,
        record,
      ]),
    );
    state.merge.adjudications = [...byKey.values()];
    state.merge.error = null;
  } catch (error) {
    state.merge.error = error;
  }
  render();
};

appElement.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;

  if (form.id === "access-form") {
    beginCodeEntry(state.study, new FormData(form).get("code"));
    return;
  }

  if (form.id === "builder-form") {
    try {
      if (!state.builder.cards) {
        throw new SaltValidationError("Load production cards.jsonl first.");
      }
      const data = new FormData(form);
      const annotatorIds = parseRoster(data.get("roster"));
      state.builder.result = createStudy({
        cards: state.builder.cards,
        qualificationCards: state.builder.qualificationCards,
        annotatorIds,
        seed: data.get("seed"),
        coverageTarget: Number(data.get("coverage")),
        sliceSize: Number(data.get("slice")),
        rubricVersion: data.get("rubric"),
        coincidentTarget: Number(data.get("quota")),
        title: data.get("title"),
      });
      state.builder.error = null;
      announce(`Study ${state.builder.result.study.study_id} generated.`);
    } catch (error) {
      state.builder.error = error;
      state.builder.result = null;
    }
    render();
    return;
  }

  if (form.id === "rubric-form") {
    const nextRubric = String(new FormData(form).get("rubric")).trim();
    if (nextRubric && nextRubric !== state.snapshot.rubric_version) {
      const timestamp = nextSessionTimestamp();
      state.snapshot = {
        ...state.snapshot,
        rubric_version: nextRubric,
        events: [
          ...state.snapshot.events,
          {
            event_type: "rubric_change",
            from: state.snapshot.rubric_version,
            to: nextRubric,
            annotator_id: state.annotatorId,
            session_id: state.snapshot.session_id,
            ts: timestamp.iso,
          },
        ],
      };
      persistSnapshot();
      announce(`Rubric changed to ${nextRubric}.`);
    }
    document.querySelector("#rubric-dialog")?.close();
    render();
    return;
  }

  if (form.id === "resolve-form") {
    const label = event.submitter?.value;
    const data = new FormData(form);
    const rationale = String(data.get("rationale") ?? "").trim();
    const adjudicatorId = String(data.get("adjudicator") ?? "").trim();
    if (!LABELS.includes(label) || !rationale || !adjudicatorId) {
      state.adjudicationError =
        "Choose a label and provide both a rationale and adjudicator ID.";
      render();
      return;
    }
    const merge = computeMerge();
    const resolvedIds = new Set(
      state.merge.adjudications.map((record) => record.relation_id),
    );
    const current = merge.summaries.find(
      (summary) =>
        (summary.entropy > 0 || summary.labels.includes("U")) &&
        !resolvedIds.has(summary.relation_id),
    );
    if (!current) {
      return;
    }
    const timestamp = nextMonotoneTimestamp(state.lastAdjudicationTimestampMs);
    state.lastAdjudicationTimestampMs = timestamp.timestampMs;
    state.merge.adjudications = [
      ...state.merge.adjudications,
      createAdjudication({
        studyId:
          merge.study?.study_id ?? current.swipes[0]?.study_id ?? "unscoped",
        deckHash:
          merge.study?.deck_hash ?? current.swipes[0]?.deck_hash ?? "unknown",
        relationId: current.relation_id,
        cardHash:
          current.card?.card_hash ?? current.swipes[0]?.card_hash ?? "unknown",
        label,
        rationale,
        adjudicatorId,
        timestamp,
      }),
    ];
    state.adjudicationError = "";
    saveAdjudications(merge.study?.study_id ?? merge.studyIds[0]);
    announce(`${current.relation_id} adjudicated ${label}.`);
    render();
  }
});

appElement.addEventListener("change", (event) => {
  const input = event.target;
  const kind = input.dataset.fileKind;
  if (!kind) {
    return;
  }
  if (kind === "cards" || kind === "qualification") {
    void loadBuilderFile(kind, input.files?.[0]);
  } else if (kind === "swipes") {
    void loadMergeFiles([...input.files]);
  } else if (kind === "manifest") {
    void loadManifestFile(input.files?.[0]);
  } else if (kind === "adjudications") {
    void loadAdjudicationFile(input.files?.[0]);
  }
});

appElement.addEventListener("input", (event) => {
  if (event.target.id === "swipe-note") {
    state.noteDraft = event.target.value;
    const counter = document.querySelector("[data-note-count]");
    if (counter) {
      counter.textContent = String(state.noteDraft.length);
    }
  }
});

appElement.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-drop-kind]");
  if (!zone) {
    return;
  }
  event.preventDefault();
  zone.classList.add("is-dragging");
});

appElement.addEventListener("dragleave", (event) => {
  event.target.closest("[data-drop-kind]")?.classList.remove("is-dragging");
});

appElement.addEventListener("drop", (event) => {
  const zone = event.target.closest("[data-drop-kind]");
  if (!zone) {
    return;
  }
  event.preventDefault();
  zone.classList.remove("is-dragging");
  const files = [...event.dataTransfer.files];
  const kind = zone.dataset.dropKind;
  if (kind === "cards" || kind === "qualification") {
    void loadBuilderFile(kind, files[0]);
  } else if (kind === "swipes") {
    void loadMergeFiles(files);
  } else if (kind === "manifest") {
    void loadManifestFile(files[0]);
  } else if (kind === "adjudications") {
    void loadAdjudicationFile(files[0]);
  }
});

appElement.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("[data-swipe-card]")) {
    return;
  }
  state.pointerStart = {
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId,
  };
});

appElement.addEventListener("pointerup", (event) => {
  if (
    !state.pointerStart ||
    state.pointerStart.id !== event.pointerId ||
    !event.target.closest("[data-swipe-card]")
  ) {
    state.pointerStart = null;
    return;
  }
  const deltaX = event.clientX - state.pointerStart.x;
  const deltaY = event.clientY - state.pointerStart.y;
  state.pointerStart = null;
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 56) {
    return;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    decide(deltaX > 0 ? "P" : "O");
  } else {
    decide(deltaY > 0 ? "U" : "C");
  }
});

appElement.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]")?.dataset.tab;
  if (tab) {
    const leavingAdjudication =
      state.mode === "workspace" &&
      state.activeTab === "adjudicate" &&
      tab !== "adjudicate";
    const returningToAdjudication =
      state.mode === "workspace" &&
      state.activeTab !== "adjudicate" &&
      tab === "adjudicate";
    if (leavingAdjudication) {
      state.timer.pause();
    }
    state.activeTab = tab;
    state.mode = state.snapshot
      ? "workspace"
      : tab === "merge"
        ? "merge"
        : state.mode;
    if (returningToAdjudication && !state.noteOpen) {
      state.timer.resume();
    }
    render();
    return;
  }

  const label = event.target.closest("[data-label]")?.dataset.label;
  if (label) {
    decide(label);
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;

  if (action === "home") {
    openHome();
  } else if (action === "demo") {
    beginCodeEntry(embeddedPayload.demo_study, embeddedPayload.demo_code);
  } else if (action === "builder") {
    state.mode = "builder";
    render();
  } else if (action === "merge") {
    state.mode = state.snapshot ? "workspace" : "merge";
    state.activeTab = "merge";
    render();
  } else if (action === "resume") {
    activateSession(state.resumeCandidate);
    render();
  } else if (action === "restart-request") {
    state.restartConfirmation = true;
    render();
  } else if (action === "restart-cancel") {
    state.restartConfirmation = false;
    render();
  } else if (action === "restart-confirm") {
    state.repository.clear();
    activateSession(createSessionSnapshot(state.study, state.annotatorId));
    render();
  } else if (action === "flag") {
    state.flagged = !state.flagged;
    announce(state.flagged ? "Card flagged." : "Flag removed.");
    render();
  } else if (action === "note") {
    state.noteOpen = !state.noteOpen;
    if (state.noteOpen) {
      state.timer.pause();
    } else {
      state.timer.resume();
    }
    render();
  } else if (action === "note-cancel") {
    state.noteDraft = "";
    state.noteOpen = false;
    state.timer.resume();
    render();
  } else if (action === "undo") {
    undoLastSwipe();
  } else if (action === "export-swipes") {
    exportSwipes();
  } else if (action === "next-pass") {
    startNextPass();
  } else if (action === "qualification-continue") {
    completeQualificationReview();
  } else if (action === "end-session") {
    state.mode = "access";
    state.snapshot = null;
    state.annotatorId = null;
    state.repository = null;
    resetTransientCardState();
    render();
  } else if (action === "rubric-open") {
    document.querySelector("#rubric-dialog")?.showModal();
  } else if (action === "rubric-cancel") {
    document.querySelector("#rubric-dialog")?.close();
  } else if (action === "builder-clear") {
    state.builder = {
      cards: null,
      qualificationCards: [],
      cardsName: "",
      qualificationName: "",
      result: null,
      error: null,
    };
    render();
  } else if (action === "download-study") {
    try {
      const result = state.builder.result;
      downloadText(
        `${safeFilenamePart(result.study.title)}-${result.study.study_id}.html`,
        buildStudyHtml(result.study),
        "text/html;charset=utf-8",
      );
      announce("Study HTML downloaded.");
    } catch (error) {
      state.builder.error = error;
      render();
    }
  } else if (action === "download-codes") {
    const result = state.builder.result;
    downloadText(
      `annotator-codes-${result.study.study_id}.tsv`,
      codeSheetToTsv(result.study, result.codeSheet),
      "text/tab-separated-values;charset=utf-8",
    );
  } else if (action === "download-manifest") {
    const result = state.builder.result;
    downloadText(
      `assignment-manifest-${result.study.study_id}.json`,
      `${JSON.stringify(manifestForExport(result.study), null, 2)}\n`,
      "application/json;charset=utf-8",
    );
  } else if (action === "remove-merge-source") {
    state.merge.sources.delete(button.dataset.filename);
    render();
  } else if (action === "start-resolve") {
    const merge = computeMerge();
    loadSavedAdjudications(merge.study?.study_id ?? merge.studyIds[0]);
    if (state.snapshot) {
      state.activeTab = "resolve";
    } else {
      state.mode = "resolve";
      state.activeTab = "resolve";
    }
    render();
  } else if (
    action === "export-merge-edge-table" ||
    action === "export-local-edge-table"
  ) {
    const summaries =
      action === "export-local-edge-table"
        ? relationSummaries(
            activeSwipes(state.snapshot.events).filter(
              (swipe) => !swipe.qualification,
            ),
            state.study.cards,
          )
        : computeMerge().summaries;
    const study =
      action === "export-local-edge-table" ? state.study : computeMerge().study;
    downloadText(
      `edge-case-table-${safeFilenamePart(study?.study_id ?? "merged")}.md`,
      edgeCaseMarkdown(summaries, state.merge.adjudications),
      "text/markdown;charset=utf-8",
    );
  } else if (action === "export-adjudications") {
    const merge = computeMerge();
    downloadText(
      `adjudications-${safeFilenamePart(
        merge.study?.study_id ?? merge.studyIds[0] ?? "merged",
      )}.jsonl`,
      adjudicationsToJsonl(state.merge.adjudications),
      "application/x-ndjson;charset=utf-8",
    );
  }
});

document.addEventListener("keydown", (event) => {
  if (
    state.mode !== "workspace" ||
    state.activeTab !== "adjudicate" ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return;
  }
  const target = event.target;
  const inField =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (inField) {
    if (target.id === "swipe-note" && event.key === "Enter") {
      event.preventDefault();
      state.noteOpen = false;
      state.timer.resume();
      render();
    } else if (target.id === "swipe-note" && event.key === "Escape") {
      event.preventDefault();
      state.noteDraft = "";
      state.noteOpen = false;
      state.timer.resume();
      render();
    }
    return;
  }

  const labelByKey = {
    ArrowUp: "C",
    c: "C",
    C: "C",
    ArrowRight: "P",
    p: "P",
    P: "P",
    ArrowLeft: "O",
    o: "O",
    O: "O",
    ArrowDown: "U",
    u: "U",
    U: "U",
  };
  if (labelByKey[event.key]) {
    event.preventDefault();
    decide(labelByKey[event.key]);
  } else if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    state.flagged = !state.flagged;
    render();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    state.noteOpen = true;
    state.timer.pause();
    render();
  } else if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastSwipe();
  } else if (event.key.toLowerCase() === "e") {
    event.preventDefault();
    exportSwipes();
  }
});

document.addEventListener("visibilitychange", () => {
  if (
    state.mode !== "workspace" ||
    state.activeTab !== "adjudicate" ||
    !getSwipeContext()?.card
  ) {
    return;
  }
  if (document.hidden) {
    state.timer.pause();
  } else if (!state.noteOpen) {
    state.timer.resume();
  }
});

window.setInterval(() => {
  const clock = document.querySelector("[data-session-clock]");
  if (clock) {
    clock.textContent = formatDuration(currentSessionElapsed());
  }
}, 1000);

render();
