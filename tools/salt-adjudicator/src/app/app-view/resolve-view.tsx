import { useEffect, useState } from "preact/hooks";

import {
  type Label,
  LABELS,
  LABEL_DETAILS,
  perAnnotatorGoldAgreement,
} from "../../core.ts";
import { Issues, LabelTooltip, formatPercent } from "./shared/presentation.tsx";
import { PublicHeader } from "./shared/public-header.tsx";
import { WorkspaceHeader } from "./shared/workspace-header.tsx";

import type { AppController } from "../app-controller.ts";

export const ResolveView = ({ controller }: { controller: AppController }) => {
  const { state, merge, actions } = controller;
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
  const [rationale, setRationale] = useState("");
  const [adjudicatorId, setAdjudicatorId] = useState("");

  useEffect(() => {
    setRationale("");
    setAdjudicatorId("");
  }, [current?.relation_id]);

  return (
    <>
      {state.mode === "workspace" ? (
        <WorkspaceHeader controller={controller} />
      ) : (
        <PublicHeader controller={controller} active="merge" />
      )}
      <main class="resolve-view" id="main-content">
        <header class="view-heading resolve-heading">
          <div>
            <p class="system-label">Binding adjudication</p>
            <h1>Resolve the highest-entropy evidence.</h1>
          </div>
          <dl>
            <div>
              <dt>Remaining</dt>
              <dd>{queue.length}</dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{state.merge.adjudications.length}</dd>
            </div>
          </dl>
        </header>
        <Issues
          error={
            state.adjudicationError ? new Error(state.adjudicationError) : null
          }
        />
        {!current ? (
          <section class="completion-view embedded">
            <div class="completion-signal" aria-hidden="true">
              ✓
            </div>
            <h2>Adjudication queue complete.</h2>
            <p>Export the binding records and refreshed edge-case table.</p>
            <div class="button-row">
              <button
                class="button button-primary"
                type="button"
                disabled={state.merge.adjudications.length === 0}
                onClick={actions.exportAdjudications}
              >
                Export adjudications JSONL
              </button>
              <button
                class="button"
                type="button"
                onClick={() => actions.exportEdgeTable("merge")}
              >
                Export edge-case markdown
              </button>
            </div>
          </section>
        ) : (
          <section class="resolve-layout">
            <article class="resolve-card">
              <div class="resolve-card-meta">
                <code>{current.relation_id}</code>
                <span>Entropy {current.entropy.toFixed(3)}</span>
                <span>{current.labels.length} votes</span>
              </div>
              <pre>
                {current.card?.card_text ??
                  `Relation: ${current.relation_id}\nCard text is not present in the loaded exports.`}
              </pre>
              <div class="evidence-sequence" aria-label="Label evidence">
                {current.swipes.map((swipe) => (
                  <span
                    key={swipe.swipe_id}
                    class={`label-${swipe.label.toLowerCase()}`}
                  >
                    <strong>{swipe.label}</strong>
                    {swipe.annotator_id} · p{swipe.pass}
                  </span>
                ))}
              </div>
              {current.notes.length > 0 ? (
                <div class="evidence-notes">
                  <h2>Annotator notes</h2>
                  {current.notes.map((note, noteIndex) => (
                    <blockquote
                      key={`${note.annotator_id}-${note.pass}-${noteIndex}`}
                    >
                      <p>{String(note.note ?? "")}</p>
                      <cite>
                        {note.annotator_id} · pass {note.pass}
                      </cite>
                    </blockquote>
                  ))}
                </div>
              ) : null}
            </article>
            <form
              class="resolve-form"
              id="resolve-form"
              onSubmit={(event) => {
                event.preventDefault();
                const submitter = event.submitter;
                const label =
                  submitter instanceof HTMLButtonElement ? submitter.value : "";
                actions.adjudicate({
                  label: label as Label,
                  rationale,
                  adjudicatorId,
                });
              }}
            >
              <div>
                <p class="system-label">Binding record</p>
                <h2>Select the final class.</h2>
              </div>
              <fieldset class="label-choice">
                <legend>Adjudicated label</legend>
                {LABELS.map((label) => {
                  const detail = LABEL_DETAILS[label];
                  const tooltipId = `resolve-label-help-${label.toLowerCase()}`;
                  return (
                    <button
                      key={label}
                      class={`label-${label.toLowerCase()}`}
                      type="submit"
                      name="label"
                      value={label}
                      aria-describedby={tooltipId}
                    >
                      <span>{detail.arrow}</span>
                      <strong>{detail.name}</strong>
                      <kbd>{label}</kbd>
                      <LabelTooltip label={label} id={tooltipId} />
                    </button>
                  );
                })}
              </fieldset>
              <label class="field">
                One-line rationale
                <textarea
                  name="rationale"
                  rows={4}
                  maxLength={500}
                  value={rationale}
                  required
                  placeholder="Why this class is binding for the relation"
                  onInput={(event) => setRationale(event.currentTarget.value)}
                />
              </label>
              <label class="field">
                Adjudicator ID
                <input
                  name="adjudicator"
                  value={adjudicatorId}
                  required
                  autoComplete="off"
                  onInput={(event) =>
                    setAdjudicatorId(event.currentTarget.value)
                  }
                />
              </label>
              <p class="field-help">
                Choose a class button to save and advance. Adjudications never
                mix with swipe records.
              </p>
            </form>
          </section>
        )}
        {agreements.length > 0 ? (
          <section class="analysis-section">
            <div class="section-heading">
              <h2>Agreement with adjudicated gold</h2>
              <span>{state.merge.adjudications.length} binding records</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Annotator</th>
                  <th>Matches</th>
                  <th>Agreement</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((entry) => (
                  <tr key={entry.annotator_id}>
                    <th scope="row">{entry.annotator_id}</th>
                    <td>
                      {entry.matching} / {entry.total}
                    </td>
                    <td>{formatPercent(entry.agreement, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
    </>
  );
};
