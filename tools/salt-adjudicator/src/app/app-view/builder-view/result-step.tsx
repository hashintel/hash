import type { AppActions } from "../../app-controller.ts";
import type { StudyBuildResult } from "../../app-controller/model.ts";

export const ResultStep = ({
  result,
  actions,
  onRevise,
}: {
  result: StudyBuildResult;
  actions: Pick<
    AppActions,
    "downloadStudy" | "downloadCodes" | "downloadManifest"
  >;
  onRevise: () => void;
}) => (
  <section class="build-result" aria-live="polite">
    <div class="build-result-heading">
      <div>
        <p class="system-label">Step 5 · bundle ready</p>
        <h2>{result.study.study_id}</h2>
      </div>
      <code>{result.study.deck_hash.slice(0, 16)}</code>
    </div>
    <dl class="result-facts">
      <div>
        <dt>Production cards</dt>
        <dd>{result.study.cards.length}</dd>
      </div>
      <div>
        <dt>Qualification cards</dt>
        <dd>{result.study.qualification_cards.length}</dd>
      </div>
      <div>
        <dt>Annotators</dt>
        <dd>{result.study.manifest.annotator_ids.length}</dd>
      </div>
      <div>
        <dt>Coverage</dt>
        <dd>{result.study.coverage_target}×</dd>
      </div>
      <div>
        <dt>Load range</dt>
        <dd>
          {Math.min(...Object.values(result.study.manifest.loads))}–
          {Math.max(...Object.values(result.study.manifest.loads))}
        </dd>
      </div>
      <div>
        <dt>Source pool</dt>
        <dd>
          {result.study.sampling?.source_pool_size.toLocaleString() ?? "—"}
        </dd>
      </div>
    </dl>
    <div class="download-stack">
      <button
        class="button button-primary"
        type="button"
        onClick={actions.downloadStudy}
      >
        Download study HTML
      </button>
      <button class="button" type="button" onClick={actions.downloadCodes}>
        Download private code sheet TSV
      </button>
      <button class="button" type="button" onClick={actions.downloadManifest}>
        Download verification manifest JSON
      </button>
    </div>
    <div class="builder-step-actions result-actions">
      <button class="button button-quiet" type="button" onClick={onRevise}>
        Revise and regenerate
      </button>
    </div>
    <p class="result-warning">
      Send annotators only the HTML and their individual code. Keep the full
      code sheet private to avoid accidental identity collisions.
    </p>
  </section>
);
