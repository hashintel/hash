/**
 * Prototype 1 — "Predicate with a derived margin". The user writes ordinary
 * boolean expressions (what FE-1518 already ships); everything continuous
 * is DERIVED: each comparison's signed slack becomes the margin, `&&`/`||`
 * compose as min/max, the run's robustness is the worst step, and a smooth
 * multiplier turns that robustness into the objective factor. Nothing new
 * to author — the cost is that the derivation is implicit.
 */

import { useState } from "react";

import { CurvePlot, MarginStrip, TracePlot } from "./charts";
import { marginOf } from "./expr";
import { penaltyMultiplier, stepValues, traceRobustness } from "./robustness";
import {
  ConstraintInput,
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
  TOY_PARAMETERS,
  toyObjective,
} from "./toy-model";

import type { ExprNode } from "./expr";
import type { PenaltyKind } from "./robustness";

const EXPLAINER = `State constraints stay plain boolean expressions — the same surface the optimization drawer already has. The continuous part is derived, never authored: a comparison's signed slack is its margin, && takes the worst one, and the run's robustness is the worst step. The multiplier below is what the optimizer would multiply the objective by: 1 while the run stays safe, decaying smoothly the deeper the violation, so "how badly it failed" stays visible to the sampler.

Drag the parameters to push the run in and out of the safe region. "Worst constraint" aggregation is the classical min — note how one deeply-violated constraint completely masks progress on the other; "mean violation" keeps both visible.`;

const DEFAULT_CONSTRAINTS = ["temperature < 80", "pressure < 4.5"];

function meanViolation(margins: readonly number[]): number {
  const finite = margins.map((value) =>
    Number.isFinite(value) ? value : Math.sign(value) * 1e6,
  );
  if (finite.every((value) => value >= 0)) {
    return Math.min(...finite);
  }
  const violations = finite.filter((value) => value < 0);
  return violations.reduce((sum, value) => sum + value, 0) / margins.length;
}

const probeCache = new Map<string, ExprNode>();

function firstNumericProbe(name: string): ExprNode {
  const cached = probeCache.get(name);
  if (cached) {
    return cached;
  }
  const node: ExprNode = { kind: "ident", name };
  probeCache.set(name, node);
  return node;
}

function formatMargin(value: number): string {
  if (!Number.isFinite(value)) {
    return value > 0 ? "∞" : "−∞";
  }
  return value.toFixed(2);
}

export const PredicatePrototype = () => {
  const [sources, setSources] = useState(DEFAULT_CONSTRAINTS);
  const [parameters, setParameters] = useState(TOY_DEFAULTS);
  const [width, setWidth] = useState(10);
  const [kind, setKind] = useState<PenaltyKind>("exponential");
  const [aggregation, setAggregation] = useState<"worst" | "meanViolation">(
    "worst",
  );

  const trace = simulateToyRun(parameters);
  const parsed = sources.map(parseConstraint);
  const nodes = parsed.flatMap((entry) => (entry.ok ? [entry.node] : []));

  const robustnessPer = nodes.map((node) => traceRobustness(node, trace));
  const robustness =
    robustnessPer.length === 0
      ? Infinity
      : aggregation === "worst"
        ? Math.min(...robustnessPer)
        : meanViolation(robustnessPer);
  const multiplier = penaltyMultiplier(robustness, width, kind);
  const objective = toyObjective(trace);

  const combinedStepMargin = (stepIndex: number): number => {
    const margins = nodes.map((node) =>
      marginOf(node, trace.steps[stepIndex]!),
    );
    if (margins.length === 0) {
      return Infinity;
    }
    return aggregation === "worst"
      ? Math.min(...margins)
      : meanViolation(margins);
  };
  const stepMarginValues = trace.steps.map((_, index) =>
    combinedStepMargin(index),
  );

  return (
    <PrototypeShell
      title="1 · Predicate with a derived margin"
      explainer={EXPLAINER}
    >
      <Section title="Constraints (boolean expressions over the run)">
        {sources.map((source, index) => (
          <ConstraintInput
            // eslint-disable-next-line react/no-array-index-key -- fixed slots
            key={index}
            path={`constraint-prototypes/predicate-${index}.ts`}
            value={source}
            onChange={(next) =>
              setSources(sources.map((old, at) => (at === index ? next : old)))
            }
            error={
              parsed[index]!.ok
                ? undefined
                : (parsed[index] as { error: string }).error
            }
            after={
              parsed[index]!.ok ? (
                <Stat
                  label="robustness"
                  value={formatMargin(
                    traceRobustness(
                      (parsed[index] as { node: ExprNode }).node,
                      trace,
                    ),
                  )}
                  tone={
                    traceRobustness(
                      (parsed[index] as { node: ExprNode }).node,
                      trace,
                    ) >= 0
                      ? "good"
                      : "bad"
                  }
                />
              ) : undefined
            }
          />
        ))}
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
              values: stepValues(firstNumericProbe("temperature"), trace),
            },
            {
              name: "pressure ×10",
              values: stepValues(firstNumericProbe("pressure"), trace).map(
                (value) => value * 10,
              ),
            },
            {
              name: "throughput",
              values: stepValues(firstNumericProbe("throughput"), trace),
            },
          ]}
          violations={stepMarginValues.map((value) => value < 0)}
        />
        <MarginStrip values={stepMarginValues} />
      </Section>

      <Section title="From robustness to the objective">
        <Row>
          <label>
            aggregation{" "}
            <select
              value={aggregation}
              onChange={(event) =>
                setAggregation(event.target.value as "worst" | "meanViolation")
              }
            >
              <option value="worst">worst constraint (min)</option>
              <option value="meanViolation">mean violation (no masking)</option>
            </select>
          </label>
          <label>
            decay{" "}
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as PenaltyKind)}
            >
              <option value="exponential">exponential (1 inside)</option>
              <option value="logistic">logistic (discounts the edge)</option>
              <option value="hard">hard cut (what pruning does)</option>
            </select>
          </label>
          <Slider
            label="tolerance width"
            value={width}
            min={1}
            max={40}
            onChange={setWidth}
          />
        </Row>
        <Row>
          <CurvePlot
            domain={[-3 * width, 3 * width]}
            fn={(margin) => penaltyMultiplier(margin, width, kind)}
            marker={Number.isFinite(robustness) ? robustness : undefined}
            label="objective multiplier vs run robustness"
          />
          <div>
            <Row>
              <Stat
                label="run robustness"
                value={formatMargin(robustness)}
                tone={robustness >= 0 ? "good" : "bad"}
              />
              <Stat
                label="objective (mean throughput)"
                value={objective.toFixed(2)}
              />
            </Row>
            <Row>
              <Stat label="multiplier" value={multiplier.toFixed(3)} />
              <Stat
                label="scored objective"
                value={(objective * multiplier).toFixed(2)}
                tone={multiplier > 0.5 ? "good" : "bad"}
              />
            </Row>
          </div>
        </Row>
      </Section>
    </PrototypeShell>
  );
};
