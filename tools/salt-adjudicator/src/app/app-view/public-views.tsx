import { useEffect, useState } from "preact/hooks";

import { projectSwipes } from "../../core.ts";
import { formatInteger } from "./shared/presentation.tsx";
import { PublicHeader } from "./shared/public-header.tsx";

import type { AppController } from "../app-controller.ts";

export const HomeView = ({ controller }: { controller: AppController }) => {
  const demoAvailable = controller.embeddedPayload.kind === "generic";
  useEffect(() => {
    if (!demoAvailable) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.defaultPrevented ||
        (target instanceof HTMLElement && target !== document.body)
      ) {
        return;
      }
      event.preventDefault();
      controller.actions.openDemo();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [controller.actions, demoAvailable]);

  return (
    <>
      <PublicHeader controller={controller} />
      <main class="home-view" id="main-content">
        <section class="home-intro">
          <p class="system-label">Offline annotation</p>
          <h1>Build, share, and review a relation study.</h1>
          <p class="lede">
            Create one study file, collect independent labels, and combine the
            results—without accounts or a server.
          </p>
          <div class="home-actions">
            {demoAvailable ? (
              <button
                class="button button-primary"
                type="button"
                onClick={controller.actions.openDemo}
              >
                Open the demo deck <kbd>↵</kbd>
              </button>
            ) : null}
            <button
              class="button"
              type="button"
              onClick={controller.actions.openBuilder}
            >
              Build a study
            </button>
            <button
              class="button button-quiet"
              type="button"
              onClick={controller.actions.openMerge}
            >
              Merge exports
            </button>
          </div>
        </section>
        <section class="capability-strip" aria-label="Operating guarantees">
          <div>
            <strong>One shareable file</strong>
            <span>Everything needed is included</span>
          </div>
          <div>
            <strong>Works offline</strong>
            <span>No account or server required</span>
          </div>
          <div>
            <strong>Saves as you go</strong>
            <span>Each decision is stored in this browser</span>
          </div>
        </section>
        <section class="trust-note">
          <h2>How to share a study</h2>
          <p>
            Put the generated study file at one stable URL, then send each
            annotator that link and their individual code. You can send the file
            directly instead, but one stable URL makes it easier to resume
            interrupted work.
          </p>
          <p>
            A code assigns the correct cards and helps catch typing mistakes. It
            does not restrict access: anyone with the study file can inspect its
            contents, including qualification answers.
          </p>
        </section>
      </main>
    </>
  );
};

export const AccessView = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  const [code, setCode] = useState("");

  useEffect(() => {
    setCode("");
  }, [state.study?.study_id]);

  if (!state.study) {
    return null;
  }
  return (
    <>
      <PublicHeader controller={controller} />
      <main class="access-view" id="main-content">
        <section class="access-panel">
          <p class="system-label">Study bundle · {state.study.study_id}</p>
          <h1>{state.study.title}</h1>
          <p>
            Enter the short code supplied by the coordinator. Your identity is
            fixed for this session and every export.
          </p>
          <dl class="study-facts">
            <div>
              <dt>Production slice</dt>
              <dd>≤ {formatInteger(state.study.slice_size)} cards</dd>
            </div>
            <div>
              <dt>Coverage target</dt>
              <dd>{state.study.coverage_target} annotators/card</dd>
            </div>
            <div>
              <dt>Rubric</dt>
              <dd>{state.study.rubric_version}</dd>
            </div>
            <div>
              <dt>Deck hash</dt>
              <dd>
                <code>{state.study.deck_hash.slice(0, 12)}</code>
              </dd>
            </div>
          </dl>
          <form
            class="access-form"
            id="access-form"
            onSubmit={(event) => {
              event.preventDefault();
              actions.beginCodeEntry(code);
            }}
          >
            <label htmlFor="annotator-code">Annotator code</label>
            <input
              id="annotator-code"
              name="code"
              inputMode="text"
              autoComplete="off"
              autocapitalize="characters"
              spellcheck={false}
              placeholder="ABCD-EFGH"
              value={code}
              required
              onInput={(event) => setCode(event.currentTarget.value)}
            />
            {state.accessError ? (
              <p class="field-error" id="code-error" role="alert">
                {state.accessError}
              </p>
            ) : (
              <p class="field-help">
                Eight characters; the hyphen is optional.
              </p>
            )}
            <button class="button button-primary" type="submit">
              Continue
            </button>
          </form>
        </section>
      </main>
    </>
  );
};

export const ResumeView = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  if (!state.resumeCandidate) {
    return null;
  }
  const projected = projectSwipes(state.resumeCandidate.events);
  const active = projected.filter((swipe) => !swipe.retracted);
  return (
    <>
      <PublicHeader controller={controller} />
      <main class="access-view" id="main-content">
        <section class="access-panel">
          <p class="system-label">Saved local session found</p>
          <h1>Resume {state.annotatorId}?</h1>
          <p>SALT found a crash-safe session for this exact study and deck.</p>
          <dl class="study-facts">
            <div>
              <dt>Active swipes</dt>
              <dd>{active.length}</dd>
            </div>
            <div>
              <dt>Current pass</dt>
              <dd>{state.resumeCandidate.current_pass}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>
                {new Date(
                  state.resumeCandidate.session_started_at,
                ).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Not exported</dt>
              <dd>
                {Math.max(
                  0,
                  state.resumeCandidate.events.length -
                    state.resumeCandidate.exported_event_count,
                )}
              </dd>
            </div>
          </dl>
          <div class="button-row">
            <button
              class="button button-primary"
              type="button"
              onClick={actions.resumeSession}
            >
              Resume session
            </button>
            <button
              class="button button-danger-quiet"
              type="button"
              onClick={actions.requestRestart}
            >
              Start clean
            </button>
          </div>
          {state.restartConfirmation ? (
            <div class="inline-confirm" role="alert">
              <p>
                This deletes the browser&apos;s crash buffer for this annotator.
                Export it first if you need the existing evidence.
              </p>
              <div class="button-row">
                <button
                  class="button button-danger"
                  type="button"
                  onClick={actions.restartSession}
                >
                  Delete and restart
                </button>
                <button
                  class="button button-quiet"
                  type="button"
                  onClick={actions.cancelRestart}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
};

export const FatalView = ({ controller }: { controller: AppController }) => (
  <>
    <PublicHeader controller={controller} />
    <main class="fatal-view" id="main-content">
      <p class="system-label">SALT stopped safely</p>
      <h1>Evidence cannot be collected in this state.</h1>
      <p>{controller.state.fatalError}</p>
      <button
        class="button"
        type="button"
        onClick={controller.actions.openHome}
      >
        Return home
      </button>
    </main>
  </>
);
