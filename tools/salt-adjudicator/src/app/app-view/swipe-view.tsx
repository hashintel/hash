import { useEffect, useRef } from "preact/hooks";

import {
  type Label,
  LABELS,
  LABEL_DETAILS,
  activeSwipes,
  exampleSeedFor,
  shuffleCardText,
} from "../../core.ts";
import { LabelTooltip, formatPercent } from "./shared/presentation.tsx";
import {
  WorkspaceHeader,
  useNativeDialog,
} from "./shared/workspace-header.tsx";

import type {
  AppController,
  ProductionSwipeContext,
} from "../app-controller.ts";

type DecisionPosition = "top" | "right" | "left" | "bottom";

const LabelGuide = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  const dialogRef = useNativeDialog(state.guideOpen);
  return (
    <dialog
      ref={dialogRef}
      class="label-guide"
      id="label-guide"
      onCancel={(event) => {
        event.preventDefault();
        actions.closeGuide();
      }}
    >
      <div class="label-guide-heading">
        <div>
          <p class="system-label">
            Rubric{" "}
            {state.snapshot?.rubric_version ??
              state.study?.rubric_version ??
              ""}
          </p>
          <h2>Geometry class guide</h2>
        </div>
        <button
          class="icon-text-button"
          type="button"
          onClick={actions.closeGuide}
        >
          Close <kbd>Esc</kbd>
        </button>
      </div>
      <p>
        These are operational reminders. The study rubric remains the binding
        definition.
      </p>
      <dl>
        {LABELS.map((label) => {
          const detail = LABEL_DETAILS[label];
          return (
            <div key={label} class={`label-${label.toLowerCase()}`}>
              <dt>
                <span aria-hidden="true">{detail.arrow}</span>
                <strong>{detail.name}</strong>
                <kbd>{label}</kbd>
              </dt>
              <dd>{detail.description}</dd>
            </div>
          );
        })}
      </dl>
    </dialog>
  );
};

const StorageError = ({ controller }: { controller: AppController }) =>
  controller.state.storageError ? (
    <div class="storage-blocker" role="alert">
      <strong>Persistence stopped</strong>
      <p>{controller.state.storageError}</p>
      <button
        class="button"
        type="button"
        onClick={controller.actions.exportSwipes}
      >
        Export current evidence
      </button>
    </div>
  ) : null;

const DecisionZone = ({
  label,
  position,
  onDecide,
}: {
  label: Label;
  position: DecisionPosition;
  onDecide: (label: Label) => void;
}) => {
  const detail = LABEL_DETAILS[label];
  const tooltipId = `label-help-${label.toLowerCase()}-${position}`;
  return (
    <button
      class={`decision-zone zone-${position} label-${label.toLowerCase()}`}
      type="button"
      aria-label={`${detail.name}, ${detail.direction}, ${label}`}
      aria-describedby={tooltipId}
      onClick={() => onDecide(label)}
    >
      <span aria-hidden="true">{detail.arrow}</span>
      <strong>{detail.name}</strong>
      <kbd>{label}</kbd>
      <LabelTooltip label={label} id={tooltipId} />
    </button>
  );
};

const NoteComposer = ({ controller }: { controller: AppController }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, []);

  return (
    <div class="note-composer">
      <div class="note-heading">
        <label htmlFor="swipe-note">
          Note <span>timer paused</span>
        </label>
        <span>
          <span data-note-count>{controller.state.noteDraft.length}</span>
          /280
        </span>
      </div>
      <input
        ref={inputRef}
        id="swipe-note"
        maxLength={280}
        value={controller.state.noteDraft}
        placeholder="One line of context for downstream review"
        autoComplete="off"
        onInput={(event) =>
          controller.actions.setNoteDraft(event.currentTarget.value)
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            controller.actions.keepNote();
          } else if (event.key === "Escape") {
            event.preventDefault();
            controller.actions.clearNote();
          }
        }}
      />
      <div class="note-help">
        <span>
          <kbd>Enter</kbd> keep note
        </span>
        <button
          class="text-button"
          type="button"
          onClick={controller.actions.clearNote}
        >
          Clear and close <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
};

const useSwipeKeyboardShortcuts = (controller: AppController): void => {
  const { actions } = controller;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        controller.state.guideOpen ||
        controller.state.mode !== "workspace" ||
        controller.state.activeTab !== "adjudicate" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const labelByKey: Readonly<Record<string, Label>> = {
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
      const label = labelByKey[event.key];
      if (label) {
        event.preventDefault();
        actions.decide(label);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        actions.toggleFlag();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        actions.openNote();
      } else if (event.key === "?") {
        event.preventDefault();
        actions.openGuide();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        actions.undoLastSwipe();
      } else if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        actions.exportSwipes();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    actions,
    controller.state.activeTab,
    controller.state.guideOpen,
    controller.state.mode,
  ]);
};

const QualificationReview = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  if (!state.study || !state.snapshot) {
    return null;
  }
  const qualificationSwipes = activeSwipes(state.snapshot.events).filter(
    (swipe) => swipe.qualification && swipe.annotator_id === state.annotatorId,
  );
  const swipeByRelation = new Map(
    qualificationSwipes.map((swipe) => [swipe.relation_id, swipe]),
  );
  const missed = state.study.qualification_cards.filter(
    (card) => swipeByRelation.get(card.relation_id)?.label !== card.answer,
  );
  return (
    <>
      <WorkspaceHeader controller={controller} />
      <main class="review-view" id="main-content">
        <header class="view-heading">
          <p class="system-label">
            Qualification complete · {qualificationSwipes.length}/
            {state.study.qualification_cards.length}
          </p>
          <h1>
            {missed.length === 0
              ? "Calibration matched every anchor."
              : `${missed.length} anchor${
                  missed.length === 1 ? "" : "s"
                } to review.`}
          </h1>
          <p>
            Answers were hidden until the full deck was complete. Qualification
            swipes remain marked and are excluded from gold aggregation.
          </p>
        </header>
        {missed.length === 0 ? (
          <div class="notice notice-success">
            <strong>No corrections needed.</strong>
            <p>Continue when you are ready for the production slice.</p>
          </div>
        ) : (
          <ol class="missed-list">
            {missed.map((card) => {
              const swipe = swipeByRelation.get(card.relation_id);
              if (!swipe) {
                throw new Error(
                  `SALT state is missing the qualification swipe for ${card.relation_id}.`,
                );
              }
              return (
                <li key={card.relation_id}>
                  <div class="missed-result">
                    <code>{card.relation_id}</code>
                    <span>
                      Your label{" "}
                      <strong
                        class={`label-text label-${swipe.label.toLowerCase()}`}
                      >
                        {swipe.label} · {LABEL_DETAILS[swipe.label].name}
                      </strong>
                    </span>
                    <span>
                      Anchor{" "}
                      <strong
                        class={`label-text label-${card.answer.toLowerCase()}`}
                      >
                        {card.answer} · {LABEL_DETAILS[card.answer].name}
                      </strong>
                    </span>
                  </div>
                  <pre>{card.card_text}</pre>
                  <p>{card.rationale}</p>
                </li>
              );
            })}
          </ol>
        )}
        <button
          class="button button-primary"
          type="button"
          onClick={actions.completeQualificationReview}
        >
          Continue to production
        </button>
      </main>
    </>
  );
};

const PassComplete = ({
  controller,
  context,
}: {
  controller: AppController;
  context: ProductionSwipeContext;
}) => {
  const { state, actions } = controller;
  if (!state.snapshot) {
    return null;
  }
  const isTargeted = context.pass >= 4;
  const active = activeSwipes(state.snapshot.events).filter(
    (swipe) =>
      !swipe.qualification &&
      swipe.annotator_id === state.annotatorId &&
      swipe.pass === context.pass,
  );
  return (
    <>
      <WorkspaceHeader controller={controller} />
      <main class="completion-view" id="main-content">
        <div class="completion-signal" aria-hidden="true">
          ✓
        </div>
        <p class="system-label">
          {isTargeted ? "Targeted pass" : "Production pass"} {context.pass}
        </p>
        <h1>
          {isTargeted && active.length === 0
            ? "No local disagreements need another pass."
            : "Pass complete."}
        </h1>
        <p>
          {active.length} active swipe{active.length === 1 ? "" : "s"} recorded.
          Export now; the downloaded JSONL is the system of record.
        </p>
        <div class="completion-actions">
          <button
            class="button button-primary"
            type="button"
            onClick={actions.exportSwipes}
          >
            Export swipes.jsonl
          </button>
          <button class="button" type="button" onClick={actions.startNextPass}>
            Start pass {context.pass + 1}
            {context.pass + 1 >= 4 ? " · targeted" : ""}
          </button>
          <button
            class="button button-quiet"
            type="button"
            onClick={() => actions.selectTab("progress")}
          >
            Review progress
          </button>
        </div>
      </main>
    </>
  );
};

export const SwipeView = ({ controller }: { controller: AppController }) => {
  useSwipeKeyboardShortcuts(controller);
  const pointerStart = useRef<{
    x: number;
    y: number;
    id: number;
  } | null>(null);
  const { state, swipeContext: context, actions } = controller;
  if (!state.study || !state.annotatorId || !context) {
    throw new Error("SALT cannot render a swipe without an active session.");
  }
  if (context.phase === "qualification-review") {
    return <QualificationReview controller={controller} />;
  }
  if (!context.card) {
    return <PassComplete controller={controller} context={context} />;
  }

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

  return (
    <>
      <WorkspaceHeader controller={controller} />
      <LabelGuide controller={controller} />
      <StorageError controller={controller} />
      <main
        class={[
          "swipe-view",
          displayPhase === "qualification" ? "is-qualification" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        id="main-content"
      >
        <div class="swipe-mode-banner">
          <span>
            {displayPhase === "qualification"
              ? "Qualification · answers reveal after completion"
              : displayPass >= 4
                ? "Targeted mode · prior local disagreement or U only"
                : `Production pass ${displayPass}`}
          </span>
          <span>
            {context.completed} / {context.total}
          </span>
          <progress value={progressValue} max={1}>
            {formatPercent(progressValue)}
          </progress>
        </div>
        <DecisionZone label="C" position="top" onDecide={actions.decide} />
        <DecisionZone label="P" position="right" onDecide={actions.decide} />
        <DecisionZone label="O" position="left" onDecide={actions.decide} />
        <DecisionZone label="U" position="bottom" onDecide={actions.decide} />
        <section class="relation-stage" aria-label="Current relation">
          <article
            class={`relation-card ${exitClass}`}
            data-swipe-card
            onPointerDown={(event) => {
              pointerStart.current = {
                x: event.clientX,
                y: event.clientY,
                id: event.pointerId,
              };
            }}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
            onPointerUp={(event) => {
              const start = pointerStart.current;
              pointerStart.current = null;
              if (!start || start.id !== event.pointerId) {
                return;
              }
              const deltaX = event.clientX - start.x;
              const deltaY = event.clientY - start.y;
              if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 56) {
                return;
              }
              if (Math.abs(deltaX) > Math.abs(deltaY)) {
                actions.decide(deltaX > 0 ? "P" : "O");
              } else {
                actions.decide(deltaY > 0 ? "U" : "C");
              }
            }}
          >
            <div class="card-meta">
              <span>{displayCard.relation_id}</span>
              <span>{displayCard.family_id}</span>
              <span>
                {displayCard.prescreen === "equivalence"
                  ? "Coincident prescreen"
                  : "Normal prescreen"}
              </span>
            </div>
            <pre>{renderedText}</pre>
          </article>
          {state.noteOpen ? <NoteComposer controller={controller} /> : null}
        </section>
        <footer class="swipe-actions">
          <button
            class={state.flagged ? "is-active" : ""}
            type="button"
            aria-pressed={state.flagged}
            onClick={actions.toggleFlag}
          >
            <kbd>F</kbd>
            <span>{state.flagged ? "Flagged" : "Flag"}</span>
          </button>
          <button
            class={state.noteOpen ? "is-active" : ""}
            type="button"
            aria-pressed={state.noteOpen}
            onClick={actions.toggleNote}
          >
            <kbd>N</kbd>
            <span>Note</span>
          </button>
          <button type="button" onClick={actions.openGuide}>
            <kbd>?</kbd>
            <span>Class guide</span>
          </button>
          <span class="action-spacer" />
          <button type="button" onClick={actions.undoLastSwipe}>
            <kbd>Z</kbd>
            <span>Undo</span>
          </button>
          <button type="button" onClick={actions.exportSwipes}>
            <span>Export</span>
            <kbd>E</kbd>
          </button>
        </footer>
      </main>
    </>
  );
};
