import { useEffect, useRef, useState } from "preact/hooks";

import { formatDuration } from "./presentation.tsx";

import type { AppController, WorkspaceTab } from "../../app-controller.ts";

const useNativeDialog = (open: boolean) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  return dialogRef;
};

const RubricDialog = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  const snapshot = state.snapshot;
  const [rubricVersion, setRubricVersion] = useState(
    snapshot?.rubric_version ?? "",
  );
  const dialogRef = useNativeDialog(state.rubricOpen);

  useEffect(() => {
    if (state.rubricOpen && snapshot) {
      setRubricVersion(snapshot.rubric_version);
    }
  }, [snapshot, state.rubricOpen]);

  return (
    <dialog
      ref={dialogRef}
      class="rubric-dialog"
      id="rubric-dialog"
      onCancel={(event) => {
        event.preventDefault();
        actions.closeRubric();
      }}
    >
      <form
        id="rubric-form"
        onSubmit={(event) => {
          event.preventDefault();
          actions.changeRubric(rubricVersion);
        }}
      >
        <p class="system-label">Recorded metadata change</p>
        <h2>Change rubric version?</h2>
        <p>
          Existing swipes keep their original version. Only subsequent swipes
          receive the new value.
        </p>
        <label htmlFor="rubric-version">Rubric version</label>
        <input
          id="rubric-version"
          name="rubric"
          value={rubricVersion}
          required
          onInput={(event) => setRubricVersion(event.currentTarget.value)}
        />
        <div class="button-row">
          <button class="button button-primary" type="submit">
            Confirm change
          </button>
          <button
            class="button button-quiet"
            type="button"
            onClick={actions.closeRubric}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
};

const SessionClock = ({ controller }: { controller: AppController }) => {
  const [elapsed, setElapsed] = useState(controller.getSessionElapsed());
  const sessionId = controller.state.snapshot?.session_id;

  useEffect(() => {
    setElapsed(controller.getSessionElapsed());
    const interval = window.setInterval(
      () => setElapsed(controller.getSessionElapsed()),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [sessionId]);

  return <dd data-session-clock>{formatDuration(elapsed)}</dd>;
};

export const WorkspaceHeader = ({
  controller,
}: {
  controller: AppController;
}) => {
  const { state, swipeContext, actions } = controller;
  if (!state.study || !state.snapshot) {
    return null;
  }
  const tabs: Array<readonly [WorkspaceTab, string]> = [
    ["adjudicate", "Adjudicate"],
    ["progress", "Progress"],
    ["merge", "Merge"],
  ];
  if (state.merge.sources.size > 0) {
    tabs.push(["resolve", "Resolve"]);
  }
  const passLabel =
    swipeContext?.phase === "qualification"
      ? "Qual"
      : `P${state.snapshot.current_pass}`;
  const progress =
    swipeContext && swipeContext.total > 0
      ? `${swipeContext.completed}/${swipeContext.total}`
      : "complete";
  const unsaved = controller.getUnsavedEventCount();

  return (
    <>
      <header class="instrument-bar">
        <div class="instrument-identity">
          <span class="brand-mark">SALT</span>
          <span class="bar-divider" aria-hidden="true" />
          <span title={state.study.title}>{state.study.title}</span>
        </div>
        <dl class="session-readouts">
          <div>
            <dt>Annotator</dt>
            <dd>{state.annotatorId}</dd>
          </div>
          <div>
            <dt>Deck</dt>
            <dd>{passLabel}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{progress}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <SessionClock controller={controller} />
          </div>
          <div class={unsaved > 0 ? "is-warning" : ""}>
            <dt>Unsaved</dt>
            <dd>{unsaved}</dd>
          </div>
        </dl>
        <nav class="workspace-tabs" aria-label="Workspace views" role="tablist">
          {tabs.map(([tab, label]) => (
            <button
              key={tab}
              role="tab"
              aria-selected={state.activeTab === tab}
              class={state.activeTab === tab ? "is-active" : ""}
              type="button"
              onClick={() => actions.selectTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div class="bar-actions">
          <button
            class="text-button"
            type="button"
            onClick={actions.openRubric}
          >
            Rubric {state.snapshot.rubric_version}
          </button>
          <button
            class="icon-text-button"
            type="button"
            title="Export all swipes"
            onClick={actions.exportSwipes}
          >
            Export
          </button>
          <button
            class="icon-text-button"
            type="button"
            title="Leave this session"
            onClick={actions.endSession}
          >
            Exit
          </button>
        </div>
      </header>
      <RubricDialog controller={controller} />
    </>
  );
};

export { useNativeDialog };
