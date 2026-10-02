/**
 * Prototype 3 — "Sentence builder". The RFC's non-functional requirement
 * one, taken literally: defining a constraint feels like filling in a
 * sentence. Structured pickers (scope · quantity · direction · bound ·
 * across runs) compile to the same expression the editor-first prototypes
 * accept — the code line underneath is live, and "eject" hands the sentence
 * over to free-form editing. No expression grammar to learn, no banned
 * vocabulary on screen; the ceiling is whatever the pickers offer.
 *
 * The "across runs" column answers the RFC's stochastic question (CH1): a
 * constraint over a stochastic net is judged per seeded run, and the
 * sentence quantifies over them — every run, or at least N% of runs.
 */

import { useState } from "react";

import { printExpression } from "./expr";
import { traceRobustness } from "./robustness";
import {
  parseConstraint,
  PrototypeShell,
  Row,
  Section,
  Slider,
  Stat,
} from "./shell";
import {
  simulateToyRun,
  TOY_DEFAULTS,
  TOY_METRICS,
  TOY_PARAMETERS,
} from "./toy-model";

import type { ToyMetric } from "./toy-model";

const EXPLAINER = `Every row reads as a sentence: WHEN · WHAT · HOW · BOUND · ACROSS RUNS. The compiled expression underneath is the shared representation — the same string the expression-first prototypes accept, so the two surfaces are one feature with two entry points, not two features.

The run quantifier is the stochastic half of the story: the same sentence is judged on 24 seeded runs, and "in at least 90% of runs" is a chance constraint — satisfied when enough runs hold, with the satisfaction rate shown either way.`;

const SCOPES = [
  { id: "always", label: "At every moment" },
  { id: "eventually", label: "At some moment" },
  { id: "atEnd", label: "By the end of the run" },
  { id: "during", label: "At every moment between…" },
  { id: "within", label: "At some moment between…" },
] as const;

type ScopeId = (typeof SCOPES)[number]["id"];

const DIRECTIONS = [
  { id: "below", label: "stays below", op: "<" },
  { id: "above", label: "stays above", op: ">" },
] as const;

type DirectionId = (typeof DIRECTIONS)[number]["id"];

type Sentence = {
  scope: ScopeId;
  from: number;
  to: number;
  metric: ToyMetric;
  direction: DirectionId;
  bound: number;
  /** Runs that must satisfy the sentence, as a fraction; 1 = every run. */
  quorum: number;
};

const DEFAULT_SENTENCES: Sentence[] = [
  {
    scope: "always",
    from: 0,
    to: 60,
    metric: "temperature",
    direction: "below",
    bound: 80,
    quorum: 1,
  },
  {
    scope: "atEnd",
    from: 0,
    to: 60,
    metric: "throughput",
    direction: "above",
    bound: 4,
    quorum: 0.9,
  },
];

const RUN_COUNT = 24;

function compileSentence(sentence: Sentence): string {
  const comparison = `${sentence.metric} ${
    DIRECTIONS.find((direction) => direction.id === sentence.direction)!.op
  } ${sentence.bound}`;
  switch (sentence.scope) {
    case "always":
      return comparison;
    case "eventually":
      return `eventually(${comparison})`;
    case "atEnd":
      return `atEnd(${comparison})`;
    case "during":
      return `during(${sentence.from}, ${sentence.to}, ${comparison})`;
    case "within":
      return `within(${sentence.from}, ${sentence.to}, ${comparison})`;
  }
}

export const SentencePrototype = () => {
  const [sentences, setSentences] = useState(DEFAULT_SENTENCES);
  const [parameters, setParameters] = useState(TOY_DEFAULTS);

  const traces = Array.from({ length: RUN_COUNT }, (_, seed) =>
    simulateToyRun(parameters, seed + 1),
  );

  const update = (index: number, patch: Partial<Sentence>) => {
    setSentences(
      sentences.map((sentence, at) =>
        at === index ? { ...sentence, ...patch } : sentence,
      ),
    );
  };

  return (
    <PrototypeShell title="3 · Sentence builder" explainer={EXPLAINER}>
      <Section title="Constraints as sentences, judged on 24 seeded runs">
        {sentences.map((sentence, index) => {
          const source = compileSentence(sentence);
          const parsed = parseConstraint(source);
          const perRun = parsed.ok
            ? traces.map((trace) => traceRobustness(parsed.node, trace))
            : [];
          const satisfiedRuns = perRun.filter((value) => value >= 0).length;
          const rate = perRun.length === 0 ? 0 : satisfiedRuns / perRun.length;
          const holds = rate >= sentence.quorum - 1e-9;
          const windowed =
            sentence.scope === "during" || sentence.scope === "within";
          return (
            // eslint-disable-next-line react/no-array-index-key -- fixed slots
            <div key={index}>
              <Row>
                <select
                  aria-label={`Scope ${index + 1}`}
                  value={sentence.scope}
                  onChange={(event) =>
                    update(index, { scope: event.target.value as ScopeId })
                  }
                >
                  {SCOPES.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.label}
                    </option>
                  ))}
                </select>
                {windowed ? (
                  <>
                    <input
                      type="number"
                      aria-label={`From ${index + 1}`}
                      value={sentence.from}
                      style={{ width: 56 }}
                      onChange={(event) =>
                        update(index, { from: Number(event.target.value) })
                      }
                    />
                    <span>→</span>
                    <input
                      type="number"
                      aria-label={`To ${index + 1}`}
                      value={sentence.to}
                      style={{ width: 56 }}
                      onChange={(event) =>
                        update(index, { to: Number(event.target.value) })
                      }
                    />
                  </>
                ) : null}
                <select
                  aria-label={`Metric ${index + 1}`}
                  value={sentence.metric}
                  onChange={(event) =>
                    update(index, { metric: event.target.value as ToyMetric })
                  }
                >
                  {TOY_METRICS.map((metric) => (
                    <option key={metric} value={metric}>
                      {metric}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Direction ${index + 1}`}
                  value={sentence.direction}
                  onChange={(event) =>
                    update(index, {
                      direction: event.target.value as DirectionId,
                    })
                  }
                >
                  {DIRECTIONS.map((direction) => (
                    <option key={direction.id} value={direction.id}>
                      {direction.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  aria-label={`Bound ${index + 1}`}
                  value={sentence.bound}
                  style={{ width: 72 }}
                  onChange={(event) =>
                    update(index, { bound: Number(event.target.value) })
                  }
                />
                <select
                  aria-label={`Runs ${index + 1}`}
                  value={String(sentence.quorum)}
                  onChange={(event) =>
                    update(index, { quorum: Number(event.target.value) })
                  }
                >
                  <option value="1">in every run</option>
                  <option value="0.9">in ≥ 90% of runs</option>
                  <option value="0.5">in ≥ 50% of runs</option>
                </select>
                <Stat
                  label="runs satisfied"
                  value={`${satisfiedRuns}/${RUN_COUNT}`}
                  tone={holds ? "good" : "bad"}
                />
              </Row>
              <Row>
                <code style={{ fontSize: 12, opacity: 0.7 }}>
                  {parsed.ok ? printExpression(parsed.node) : source}
                </code>
                <Stat
                  label="worst run robustness"
                  value={
                    perRun.length === 0 ? "—" : Math.min(...perRun).toFixed(2)
                  }
                  tone={
                    perRun.length > 0 && Math.min(...perRun) >= 0
                      ? "good"
                      : "bad"
                  }
                />
              </Row>
            </div>
          );
        })}
        <Row>
          <button
            type="button"
            onClick={() =>
              setSentences([
                ...sentences,
                { ...DEFAULT_SENTENCES[0]!, bound: 90 },
              ])
            }
          >
            Add a sentence
          </button>
          {sentences.length > 1 ? (
            <button
              type="button"
              onClick={() => setSentences(sentences.slice(0, -1))}
            >
              Remove the last one
            </button>
          ) : null}
        </Row>
      </Section>

      <Section title="Run parameters">
        <Row>
          {TOY_PARAMETERS.map((spec) => (
            <Slider
              key={spec.name}
              label={spec.name}
              value={parameters[spec.name]!}
              min={spec.min}
              max={spec.max}
              onChange={(value) =>
                setParameters({ ...parameters, [spec.name]: value })
              }
            />
          ))}
        </Row>
      </Section>
    </PrototypeShell>
  );
};
