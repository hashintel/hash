import { LABELS, LABEL_DETAILS } from "../../core.ts";
import { DropZone } from "./shared/drop-zone.tsx";
import {
  Distribution,
  Issues,
  LabelSequence,
  formatAlpha,
  formatInteger,
} from "./shared/presentation.tsx";
import { PublicHeader } from "./shared/public-header.tsx";
import { WorkspaceHeader } from "./shared/workspace-header.tsx";

import type { AppController } from "../app-controller.ts";

export const MergeView = ({ controller }: { controller: AppController }) => {
  const { state, merge, warnings, actions } = controller;
  const hasSession = state.mode === "workspace";
  const disagreementCount = merge.summaries.filter(
    (summary) => summary.entropy > 0 || summary.labels.includes("U"),
  ).length;
  const coverageTarget = merge.study?.coverage_target;

  return (
    <>
      {hasSession ? (
        <WorkspaceHeader controller={controller} />
      ) : (
        <PublicHeader controller={controller} active="merge" />
      )}
      <main class="merge-view" id="main-content">
        <header class="view-heading">
          <p class="system-label">Coordinator mode</p>
          <h1>Merge independent evidence.</h1>
          <p>
            Drop full swipe exports. Duplicate IDs collapse safely; active
            latest votes drive cross-annotator distributions and agreement.
          </p>
        </header>
        <section class="merge-imports">
          <DropZone
            kind="swipes"
            label="Swipes JSONL · choose multiple"
            filename=""
            accept=".jsonl,application/x-ndjson,application/json"
            multiple
            onFiles={(files) => void actions.loadMergeFiles(files)}
          />
          <DropZone
            kind="manifest"
            label="Verification manifest · optional"
            filename={state.merge.manifestName}
            accept=".json,application/json"
            onFiles={(files) => void actions.loadManifestFile(files[0])}
          />
          <DropZone
            kind="adjudications"
            label="Existing adjudications · optional"
            filename={
              state.merge.adjudications.length > 0
                ? `${state.merge.adjudications.length} adjudications`
                : ""
            }
            accept=".jsonl,application/x-ndjson,application/json"
            onFiles={(files) => void actions.loadAdjudicationFile(files[0])}
          />
        </section>
        {state.merge.sources.size > 0 ? (
          <div class="file-chips" aria-label="Loaded swipe files">
            {[...state.merge.sources.entries()].map(([filename, swipes]) => (
              <span key={filename}>
                <strong>{filename}</strong>
                {swipes.length} lines
                <button
                  type="button"
                  aria-label={`Remove ${filename}`}
                  onClick={() => actions.removeMergeSource(filename)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <Issues error={state.merge.error} />
        {warnings.length > 0 ? (
          <div class="notice notice-warning" role="status">
            <strong>Merge notes</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {merge.swipes.length === 0 ? (
          <section class="merge-empty">
            <div aria-hidden="true">↳</div>
            <h2>No evidence loaded.</h2>
            <p>
              Each export may be dropped again after later sessions; stable
              swipe IDs prevent double counting.
            </p>
          </section>
        ) : (
          <>
            <section
              class="metric-line merge-metrics"
              aria-label="Merged evidence summary"
            >
              <div>
                <span>Exported swipe lines</span>
                <strong>{formatInteger(merge.swipes.length)}</strong>
              </div>
              <div>
                <span>Active latest votes</span>
                <strong>{formatInteger(merge.latest.length)}</strong>
              </div>
              <div>
                <span>Annotators</span>
                <strong>{merge.agreement.annotatorIds.length}</strong>
              </div>
              <div>
                <span>Relations in disagreement</span>
                <strong>{disagreementCount}</strong>
              </div>
            </section>
            <section class="analysis-grid merge-analysis-grid">
              <div class="analysis-section alpha-panel">
                <div class="section-heading">
                  <h2>Krippendorff’s alpha</h2>
                  <span>Nominal · latest active vote</span>
                </div>
                <strong>{formatAlpha(merge.agreement.overall)}</strong>
                <dl>
                  {LABELS.map((label) => (
                    <div key={label}>
                      <dt>{label} vs rest</dt>
                      <dd>{formatAlpha(merge.agreement.by_class[label])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div class="analysis-section coverage-panel">
                <div class="section-heading">
                  <h2>Manifest coverage</h2>
                  <span>
                    {merge.study
                      ? merge.study.study_id
                      : "No matching manifest"}
                  </span>
                </div>
                {merge.coverage && coverageTarget !== undefined ? (
                  <>
                    <strong>
                      {merge.coverage.complete} / {merge.coverage.total}
                    </strong>
                    <progress
                      value={merge.coverage.complete}
                      max={merge.coverage.total}
                    >
                      {merge.coverage.complete}/{merge.coverage.total}
                    </progress>
                    <p>
                      {
                        merge.coverage.rows.filter(
                          (row) => row.observed < row.expected,
                        ).length
                      }{" "}
                      relations remain below {coverageTarget}× coverage.
                    </p>
                  </>
                ) : (
                  <p>
                    Open the matching study bundle or load its exported manifest
                    to verify planned coverage.
                  </p>
                )}
              </div>
            </section>
            <section class="analysis-section">
              <div class="section-heading">
                <h2>Cross-annotator distributions</h2>
                <span>{merge.summaries.length} relations · entropy order</span>
              </div>
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Relation</th>
                      <th>Votes</th>
                      <th>Distribution</th>
                      <th>Sequence</th>
                      <th>Entropy</th>
                      <th>Majority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merge.summaries.slice(0, 500).map((summary) => (
                      <tr key={summary.relation_id}>
                        <th scope="row">{summary.relation_id}</th>
                        <td>{summary.labels.length}</td>
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
              <div class="button-row">
                <button
                  class="button button-primary"
                  type="button"
                  disabled={disagreementCount === 0}
                  onClick={actions.startResolve}
                >
                  Resolve {disagreementCount} edge cases
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
          </>
        )}
      </main>
    </>
  );
};
