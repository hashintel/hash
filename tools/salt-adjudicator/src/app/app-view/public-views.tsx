import { useEffect, useState } from "preact/hooks";

import { projectSwipes } from "../../core.ts";
import { formatInteger } from "./shared/presentation.tsx";
import { PublicHeader } from "./shared/public-header.tsx";

import type { AppController } from "../app-controller.ts";

export const HomeView = ({ controller }: { controller: AppController }) => {
  const demoAvailable = controller.embeddedPayload.kind === "generic";
  return (
    <>
      <PublicHeader controller={controller} />
      <main class="home-view" id="main-content">
        <section class="home-intro">
          <p class="system-label">Offline relation evidence</p>
          <h1>One file in. Independent judgments out.</h1>
          <p class="lede">
            Build a reproducible study, label with the keyboard, and merge
            append-only evidence without an account or backend.
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
            <strong>1 HTML</strong>
            <span>CSS, JS, deck, and manifest inline</span>
          </div>
          <div>
            <strong>0 requests</strong>
            <span>No runtime service or account</span>
          </div>
          <div>
            <strong>Crash-safe</strong>
            <span>Every decision stored immediately</span>
          </div>
        </section>
        <section class="trust-note">
          <h2>Distribution recommendation</h2>
          <p>
            Host the generated HTML at one stable static URL and send each
            annotator their short code. Sending the file directly also works,
            but keeping it in one location makes browser resume storage more
            predictable.
          </p>
          <p>
            Codes select an assignment and catch typos. They are not
            authentication, and qualification answers remain inspectable in an
            offline bundle.
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
              <dt>Unsaved</dt>
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
