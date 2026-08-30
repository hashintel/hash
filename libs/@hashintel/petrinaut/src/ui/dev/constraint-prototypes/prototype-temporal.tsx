/**
 * Prototype 5 — "Temporal operators" (the extension, not the base). The
 * expression grammar of prototype 1 plus five functions — `always`,
 * `eventually`, `during(t1, t2, …)`, `within(t1, t2, …)`, `until(a, b)`,
 * `atEnd(…)` — with STL quantitative semantics: the whole formula still
 * collapses to one signed robustness number, so the margin/penalty pipeline
 * is unchanged. A temperature slider swaps the exact min/max collapse for
 * the smooth logsumexp variant ("Smooth Operator", Pant et al. 2017) to
 * show what a gradient-friendly robustness looks like — and how it
 * deliberately trades soundness (an under/over-approximation band of
 * ±ln(m)·T) for smoothness.
 */

import { useState } from "react";

import { MarginStrip, TracePlot } from "./charts";
import {
  stepMargins,
  stepValues,
  traceRobustness,
  usesTemporalOperators,
} from "./robustness";
import {
  ConstraintInput,
  parseConstraint,
  PrototypeShell,
  Row,
  Section,
  Slider,
  Stat,
} from "./shell";
import { simulateToyRun, TOY_DEFAULTS, TOY_PARAMETERS } from "./toy-model";

import type { ExprNode } from "./expr";

const EXPLAINER = `Temporal logic enters as ordinary functions in the same expression grammar — no second language. A plain predicate still means "at every moment" (the safety reading); wrapping it changes the quantifier. The whole formula reduces to one signed robustness number with STL's quantitative semantics, so everything downstream (penalty multiplier, reporting, optimization) is identical to the non-temporal prototypes — which is exactly the argument for shipping temporal operators as an extension rather than a separate constraint kind.

Time bounds are in simulated time units. The smoothing slider replaces min/max with a logsumexp soft version: robustness stops being exact (it can under- or over-state by up to ln(m)·T) but becomes differentiable everywhere, which is what gradient-based tooling wants. At 0 the semantics are exact.`;

const EXAMPLES = [
  "during(20, 40, temperature < 85)",
  "eventually(throughput > 6) && temperature < 90",
  "until(pressure < 4, throughput > 5)",
  "atEnd(throughput > 4)",
  "within(0, 30, temperature > 60)",
];

export const TemporalPrototype = () => {
  const [source, setSource] = useState(EXAMPLES[0]!);
  const [parameters, setParameters] = useState(TOY_DEFAULTS);
  const [smoothing, setSmoothing] = useState(0);

  const trace = simulateToyRun(parameters);
  const parsed = parseConstraint(source);

  let exact: number | null = null;
  let smooth: number | null = null;
  let evaluationError: string | undefined;
  let node: ExprNode | null = null;
  if (parsed.ok) {
    node = parsed.node;
    try {
      exact = traceRobustness(node, trace);
      smooth =
        smoothing > 0
          ? traceRobustness(node, trace, { temperature: smoothing })
          : exact;
    } catch (error) {
      evaluationError = error instanceof Error ? error.message : String(error);
    }
  }

  const temporal = node !== null && usesTemporalOperators(node);
  const pointwiseMargins =
    node !== null && !temporal && evaluationError === undefined
      ? stepMargins(node, trace)
      : null;

  return (
    <PrototypeShell
      title="5 · Temporal operators (extension)"
      explainer={EXPLAINER}
    >
      <Section title="Constraint (temporal functions allowed)">
        <ConstraintInput
          path="constraint-prototypes/temporal.ts"
          value={source}
          onChange={setSource}
          error={parsed.ok ? evaluationError : parsed.error}
          after={
            exact !== null ? (
              <Stat
                label="robustness"
                value={exact.toFixed(2)}
                tone={exact >= 0 ? "good" : "bad"}
              />
            ) : undefined
          }
        />
        <Row>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setSource(example)}
            >
              {example}
            </button>
          ))}
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

      <Section title="The run">
        <TracePlot
          times={trace.times}
          series={[
            {
              name: "temperature",
              values: stepValues({ kind: "ident", name: "temperature" }, trace),
            },
            {
              name: "pressure ×10",
              values: stepValues(
                { kind: "ident", name: "pressure" },
                trace,
              ).map((value) => value * 10),
            },
            {
              name: "throughput",
              values: stepValues({ kind: "ident", name: "throughput" }, trace),
            },
          ]}
          violations={pointwiseMargins?.map((value) => value < 0)}
        />
        {pointwiseMargins ? <MarginStrip values={pointwiseMargins} /> : null}
      </Section>

      <Section title="Exact vs smooth robustness">
        <Row>
          <Slider
            label="smoothing temperature"
            value={smoothing}
            min={0}
            max={4}
            step={0.1}
            onChange={setSmoothing}
          />
          <Stat
            label="exact"
            value={exact === null ? "—" : exact.toFixed(3)}
            tone={exact !== null && exact >= 0 ? "good" : "bad"}
          />
          <Stat
            label={
              smoothing > 0
                ? `smooth (T=${smoothing.toFixed(1)})`
                : "smooth (off)"
            }
            value={smooth === null ? "—" : smooth.toFixed(3)}
          />
          <Stat
            label="difference"
            value={
              exact === null || smooth === null
                ? "—"
                : (smooth - exact).toFixed(3)
            }
          />
        </Row>
      </Section>
    </PrototypeShell>
  );
};
