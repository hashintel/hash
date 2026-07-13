import { useMemo, useState } from "preact/hooks";

import {
  DEFAULT_COVERAGE_TARGET,
  countCardsByPrescreen,
} from "../../study-planning.ts";
import { PlanningStep } from "./builder-view/planning-step.tsx";
import { QualificationStep } from "./builder-view/qualification-step.tsx";
import { ResultStep } from "./builder-view/result-step.tsx";
import { ReviewStep } from "./builder-view/review-step.tsx";
import { StepNavigation } from "./builder-view/step-navigation.tsx";
import { DropZone } from "./shared/drop-zone.tsx";
import { Issues } from "./shared/presentation.tsx";
import { PublicHeader } from "./shared/public-header.tsx";

import type { AppController, BuilderFormValues } from "../app-controller.ts";

const defaultBuilderValues: BuilderFormValues = {
  title: "SALT geometry adjudication",
  rubricVersion: "v1",
  seed: "salt-gold-v1",
  roster: "",
  plannerMode: "budget-first",
  coverageTarget: DEFAULT_COVERAGE_TARGET,
  productionCardsPerAnnotator: 150,
  sampleSize: 400,
};

export const BuilderView = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  const [values, setValues] = useState(defaultBuilderValues);
  const cards = state.builder.cards;
  const cardStats = useMemo(
    () => (cards ? countCardsByPrescreen(cards) : null),
    [cards],
  );

  return (
    <>
      <PublicHeader controller={controller} active="builder" />
      <main class="builder-view" id="main-content">
        <header class="view-heading builder-heading">
          <p class="system-label">Coordinator mode</p>
          <h1>Build one reproducible study bundle.</h1>
          <p>
            Import the source pool, author qualification anchors, then choose
            the exact production sample and review coverage before generation.
          </p>
        </header>

        <StepNavigation
          builder={state.builder}
          onSelect={actions.setBuilderStep}
        />

        {state.builder.step === "import" ? (
          <section class="builder-step-panel" aria-labelledby="import-title">
            <header class="builder-step-heading">
              <div>
                <p class="system-label">Step 1 · source pool</p>
                <h2 id="import-title">Import candidate relation cards.</h2>
                <p>
                  Use normalized SALT JSONL or direct atlas Wikidata extraction
                  output. SALT preserves canonical card sections and shuffles
                  only examples during annotation.
                </p>
              </div>
            </header>
            <div class="builder-import-layout">
              <DropZone
                kind="cards"
                label="Source card pool · JSONL"
                filename={state.builder.cardsName}
                accept=".jsonl,application/x-ndjson,application/json"
                onFiles={(files) =>
                  void actions.loadBuilderFile("cards", files[0])
                }
              />
              {cards && cardStats ? (
                <section class="pool-summary" aria-live="polite">
                  <p class="system-label">Pool accepted</p>
                  <strong>{cards.length.toLocaleString()}</strong>
                  <span>candidate cards</span>
                  <dl>
                    <div>
                      <dt>Equivalence prescreen</dt>
                      <dd>{cardStats.equivalence.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Normal prescreen</dt>
                      <dd>{cardStats.normal.toLocaleString()}</dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <section class="pool-summary is-empty">
                  <p class="system-label">Awaiting input</p>
                  <strong>JSONL</strong>
                  <span>One validated card per line</span>
                </section>
              )}
            </div>
            <div class="builder-step-actions">
              <button
                class="button button-quiet"
                type="button"
                disabled={!cards}
                onClick={() => {
                  actions.clearBuilder();
                  setValues(defaultBuilderValues);
                }}
              >
                Clear imported data
              </button>
              <button
                class="button button-primary"
                type="button"
                disabled={!cards}
                onClick={() => actions.setBuilderStep("qualification")}
              >
                Curate qualification anchors
              </button>
            </div>
          </section>
        ) : null}

        {state.builder.step === "qualification" && cards ? (
          <QualificationStep
            cards={cards}
            drafts={state.builder.qualificationDrafts}
            selectedRelationId={state.builder.selectedRelationId}
            onSelect={actions.selectBuilderCard}
            onSave={actions.saveQualificationDraft}
            onRemove={actions.removeQualificationDraft}
            onBack={() => actions.setBuilderStep("import")}
            onContinue={() => actions.setBuilderStep("planning")}
          />
        ) : null}

        {state.builder.step === "planning" && cards ? (
          <PlanningStep
            values={values}
            sourcePoolSize={cards.length}
            qualificationSize={state.builder.qualificationDrafts.length}
            onChange={(nextValues) => {
              setValues(nextValues);
              if (state.builder.plan || state.builder.result) {
                actions.invalidateBuilderPlan();
              }
            }}
            onBack={() => actions.setBuilderStep("qualification")}
            onReview={() => actions.reviewStudy(values)}
          />
        ) : null}

        {state.builder.step === "review" && cards && state.builder.plan ? (
          <ReviewStep
            plan={state.builder.plan}
            sourcePoolSize={cards.length}
            qualificationDrafts={state.builder.qualificationDrafts}
            values={values}
            onBack={() => actions.setBuilderStep("planning")}
            onGenerate={() => actions.generateStudy(values)}
          />
        ) : null}

        {state.builder.step === "result" && state.builder.result ? (
          <ResultStep
            result={state.builder.result}
            actions={actions}
            onRevise={() => actions.setBuilderStep("planning")}
          />
        ) : null}

        <Issues error={state.builder.error} />
      </main>
    </>
  );
};
