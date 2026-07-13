import {
  type SwipeRecord,
  LABEL_DETAILS,
  activeSwipes,
  relationSummaries,
} from "../../core.ts";
import {
  Distribution,
  LabelSequence,
  formatDuration,
  formatInteger,
  formatPercent,
} from "./shared/presentation.tsx";
import { WorkspaceHeader } from "./shared/workspace-header.tsx";

import type { AppController } from "../app-controller.ts";

const PassProgressRows = ({
  controller,
  productionSwipes,
  assignedCount,
}: {
  controller: AppController;
  productionSwipes: readonly SwipeRecord[];
  assignedCount: number;
}) => {
  const snapshot = controller.state.snapshot;
  if (!snapshot) {
    return null;
  }
  const passNumbers = [
    ...new Set(productionSwipes.map((swipe) => swipe.pass)),
    snapshot.current_pass,
  ].sort((leftPass, rightPass) => leftPass - rightPass);
  return (
    <>
      {passNumbers.map((pass) => {
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
        return (
          <div class="progress-row" key={pass}>
            <span>
              Pass {pass}
              {pass >= 4 ? " · targeted" : ""}
            </span>
            <progress value={count} max={denominator}>
              {count}/{denominator}
            </progress>
            <strong>
              {count} / {denominator}
            </strong>
          </div>
        );
      })}
    </>
  );
};

const NoiseFloorRows = ({
  controller,
  productionSwipes,
}: {
  controller: AppController;
  productionSwipes: readonly SwipeRecord[];
}) => {
  const study = controller.state.study;
  if (!study) {
    return null;
  }
  const passes = [...new Set(productionSwipes.map((swipe) => swipe.pass))].sort(
    (leftPass, rightPass) => leftPass - rightPass,
  );
  return (
    <>
      {passes.map((throughPass) => {
        const summaries = relationSummaries(
          productionSwipes.filter((swipe) => swipe.pass <= throughPass),
          study.cards,
        ).filter((summary) => summary.labels.length > 0);
        const unanimous = summaries.filter(
          (summary) => summary.unanimous,
        ).length;
        return (
          <tr key={throughPass}>
            <th scope="row">Through pass {throughPass}</th>
            <td>
              {unanimous} / {summaries.length}
            </td>
            <td>
              {formatPercent(
                summaries.length === 0 ? null : unanimous / summaries.length,
                1,
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
};

export const ProgressView = ({ controller }: { controller: AppController }) => {
  const { state, swipeContext: context, actions } = controller;
  if (!state.study || !state.snapshot || !state.annotatorId || !context) {
    throw new Error("SALT cannot render progress without an active session.");
  }
  const productionSwipes = activeSwipes(state.snapshot.events).filter(
    (swipe) => !swipe.qualification && swipe.annotator_id === state.annotatorId,
  );
  const passActive =
    context.phase === "production" && context.remaining.length > 0;
  const assignedCount =
    state.study.manifest.assignments[state.annotatorId]?.length ?? 0;
  const sessionElapsed = controller.getSessionElapsed();
  const sessionMinutes = sessionElapsed / 60_000;
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

  return (
    <>
      <WorkspaceHeader controller={controller} />
      <main class="analysis-view" id="main-content">
        <header class="view-heading">
          <p class="system-label">Local evidence · {state.annotatorId}</p>
          <h1>Progress and analysis</h1>
          <p>
            Session metrics are local to this annotator. Cross-annotator
            agreement appears in Merge.
          </p>
        </header>
        <section class="metric-line" aria-label="Session summary">
          <div>
            <span>Production swipes</span>
            <strong>{formatInteger(productionSwipes.length)}</strong>
          </div>
          <div>
            <span>Swipes / minute</span>
            <strong>{pace.toFixed(1)}</strong>
          </div>
          <div>
            <span>Session time</span>
            <strong>{formatDuration(sessionElapsed)}</strong>
          </div>
          <div>
            <span>Unsaved changes</span>
            <strong>{controller.getUnsavedEventCount()}</strong>
          </div>
        </section>
        <section class="analysis-section">
          <div class="section-heading">
            <h2>Pass completion</h2>
            <span>{assignedCount} assigned relations</span>
          </div>
          <div class="pass-progress">
            <PassProgressRows
              controller={controller}
              productionSwipes={productionSwipes}
              assignedCount={assignedCount}
            />
          </div>
        </section>
        {passActive ? (
          <section class="blind-analysis-lock">
            <span aria-hidden="true">⊘</span>
            <div>
              <h2>Label analysis is blind while this pass is active.</h2>
              <p>
                Completion and pace remain visible. Distributions, majority
                labels, notes, and the Coincident quota unlock when the current
                pass is complete.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section class="analysis-grid">
              <div class="analysis-section">
                <div class="section-heading">
                  <h2>Noise floor</h2>
                  <span>Unanimous relations</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Evidence</th>
                      <th>Unanimous</th>
                      <th>Fraction</th>
                    </tr>
                  </thead>
                  <tbody>
                    <NoiseFloorRows
                      controller={controller}
                      productionSwipes={productionSwipes}
                    />
                  </tbody>
                </table>
              </div>
              <div class="analysis-section quota-panel">
                <div class="section-heading">
                  <h2>Coincident quota</h2>
                  <span>Prescreen = equivalence</span>
                </div>
                <strong>
                  {coincidentCount} / {state.study.coincident_target}
                </strong>
                <progress
                  value={coincidentCount}
                  max={state.study.coincident_target}
                >
                  {coincidentCount}/{state.study.coincident_target}
                </progress>
                <p>
                  The 0.98 LCB gate is unpassable below roughly 150 zero-error
                  cases.
                </p>
              </div>
            </section>
            <section class="analysis-section">
              <div class="section-heading">
                <h2>Disagreement queue</h2>
                <span>{disagreementRows.length} shown · sorted by entropy</span>
              </div>
              {disagreementRows.length === 0 ? (
                <div class="empty-inline">
                  <strong>No local disagreements yet.</strong>
                  <span>
                    Relations with differing pass labels or any U will appear
                    here.
                  </span>
                </div>
              ) : (
                <div class="data-table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Relation</th>
                        <th>Distribution</th>
                        <th>Sequence</th>
                        <th>Entropy</th>
                        <th>Majority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disagreementRows.map((summary) => (
                        <tr key={summary.relation_id}>
                          <th scope="row">{summary.relation_id}</th>
                          <td>
                            <Distribution summary={summary} />
                          </td>
                          <td>
                            <LabelSequence labels={summary.labels} />
                          </td>
                          <td>{summary.entropy.toFixed(3)}</td>
                          <td>
                            {summary.majority
                              ? `${summary.majority} · ${
                                  LABEL_DETAILS[summary.majority].name
                                }`
                              : "Tie"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                class="button"
                type="button"
                onClick={() => actions.exportEdgeTable("local")}
              >
                Export edge-case markdown
              </button>
            </section>
          </>
        )}
        <aside class="throughput-note">
          <strong>Throughput, not a promise</strong>
          <span>
            At 8–15 seconds/card: 30 cards × 3 passes is about 20 minutes; 400
            cards × 3 passes is roughly 3–5 hours across sessions.
          </span>
        </aside>
      </main>
    </>
  );
};
