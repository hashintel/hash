import { useState } from "preact/hooks";

import { DropZone } from "./shared/drop-zone.tsx";
import { Issues } from "./shared/presentation.tsx";
import { PublicHeader } from "./shared/public-header.tsx";

import type { AppController, BuilderFormValues } from "../app-controller.ts";

const defaultBuilderValues: BuilderFormValues = {
  title: "SALT geometry adjudication",
  rubricVersion: "v0.3",
  seed: "salt-gold-v1",
  roster: "",
  coverageTarget: 2,
  sliceSize: 150,
  coincidentTarget: 300,
};

export const BuilderView = ({ controller }: { controller: AppController }) => {
  const { state, actions } = controller;
  const [values, setValues] = useState(defaultBuilderValues);
  const result = state.builder.result;

  return (
    <>
      <PublicHeader controller={controller} active="builder" />
      <main class="builder-view" id="main-content">
        <header class="view-heading">
          <p class="system-label">Coordinator mode</p>
          <h1>Build one reproducible study bundle.</h1>
          <p>
            The output HTML contains the deck, assignment manifest,
            qualification answers, and the full application. Annotators receive
            that file and one short code.
          </p>
        </header>
        <form
          class="builder-form"
          id="builder-form"
          onSubmit={(event) => {
            event.preventDefault();
            actions.generateStudy(values);
          }}
        >
          <section class="builder-files">
            <DropZone
              kind="cards"
              label="Production cards.jsonl"
              filename={state.builder.cardsName}
              accept=".jsonl,application/x-ndjson,application/json"
              onFiles={(files) =>
                void actions.loadBuilderFile("cards", files[0])
              }
            />
            <DropZone
              kind="qualification"
              label="Qualification JSONL · optional"
              filename={state.builder.qualificationName}
              accept=".jsonl,application/x-ndjson,application/json"
              onFiles={(files) =>
                void actions.loadBuilderFile("qualification", files[0])
              }
            />
          </section>
          <section class="form-section">
            <div class="section-heading">
              <h2>Study identity</h2>
              <span>Embedded in every export</span>
            </div>
            <div class="form-grid">
              <label class="field field-wide">
                Study title
                <input
                  name="title"
                  value={values.title}
                  required
                  onInput={(event) =>
                    setValues({
                      ...values,
                      title: event.currentTarget.value,
                    })
                  }
                />
              </label>
              <label class="field">
                Rubric version
                <input
                  name="rubric"
                  value={values.rubricVersion}
                  required
                  onInput={(event) =>
                    setValues({
                      ...values,
                      rubricVersion: event.currentTarget.value,
                    })
                  }
                />
              </label>
              <label class="field">
                Study seed
                <input
                  name="seed"
                  value={values.seed}
                  required
                  spellcheck={false}
                  onInput={(event) =>
                    setValues({
                      ...values,
                      seed: event.currentTarget.value,
                    })
                  }
                />
              </label>
            </div>
          </section>
          <section class="form-section">
            <div class="section-heading">
              <h2>Assignments</h2>
              <span>One opaque ID per line</span>
            </div>
            <div class="assignment-fields">
              <label class="field field-roster">
                Annotator IDs
                <textarea
                  name="roster"
                  rows={8}
                  placeholder={"annotator-01\nannotator-02\nannotator-03"}
                  value={values.roster}
                  required
                  onInput={(event) =>
                    setValues({
                      ...values,
                      roster: event.currentTarget.value,
                    })
                  }
                />
              </label>
              <div class="form-grid compact">
                <label class="field">
                  Coverage / card
                  <input
                    name="coverage"
                    type="number"
                    min={1}
                    step={1}
                    value={values.coverageTarget}
                    required
                    onInput={(event) =>
                      setValues({
                        ...values,
                        coverageTarget: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </label>
                <label class="field">
                  Slice cap / annotator
                  <input
                    name="slice"
                    type="number"
                    min={1}
                    step={1}
                    value={values.sliceSize}
                    required
                    onInput={(event) =>
                      setValues({
                        ...values,
                        sliceSize: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </label>
                <label class="field">
                  Coincident target
                  <input
                    name="quota"
                    type="number"
                    min={1}
                    step={1}
                    value={values.coincidentTarget}
                    required
                    onInput={(event) =>
                      setValues({
                        ...values,
                        coincidentTarget: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </section>
          <Issues error={state.builder.error} />
          <div class="form-actions">
            <button class="button button-primary" type="submit">
              Generate study
            </button>
            <button
              class="button button-quiet"
              type="button"
              onClick={() => {
                actions.clearBuilder();
                setValues(defaultBuilderValues);
              }}
            >
              Clear imported data
            </button>
          </div>
        </form>
        {result ? (
          <section class="build-result" aria-live="polite">
            <div class="build-result-heading">
              <div>
                <p class="system-label">Bundle ready</p>
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
                <dt>Load range</dt>
                <dd>
                  {Math.min(...Object.values(result.study.manifest.loads))}–
                  {Math.max(...Object.values(result.study.manifest.loads))}
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
              <button
                class="button"
                type="button"
                onClick={actions.downloadCodes}
              >
                Download private code sheet TSV
              </button>
              <button
                class="button"
                type="button"
                onClick={actions.downloadManifest}
              >
                Download verification manifest JSON
              </button>
            </div>
            <p class="result-warning">
              Send annotators only the HTML and their individual code. Keep the
              full code sheet private to avoid accidental identity collisions.
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
};
