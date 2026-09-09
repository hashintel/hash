/**
 * Prototype 4 — "Parameter sampling playground". Parameter constraints are
 * about the sampler, not the run: the same declarative predicate is fed to
 * four strategies side by side, and the scatter plots make the difference
 * tangible — pruning leaks or burns budget, construction samples the safe
 * region directly. The router table shows how each `&&` conjunct is
 * compiled: single-parameter bounds fold into the box, `a <= b` becomes an
 * ordering transform, other affine comparisons join a polytope walked with
 * hit-and-run, and anything nonlinear falls back to rejection.
 */

import { useState } from "react";

import { ScatterPlot } from "./charts";
import {
  createRng,
  estimateFeasibleFraction,
  planConjuncts,
  sampleByConstruction,
  sampleRejection,
  sampleSoftLearning,
  sampleUniform,
  satisfies,
} from "./sampling";
import {
  ConstraintInput,
  parseConstraint,
  PrototypeShell,
  Row,
  Section,
  Slider,
  Stat,
} from "./shell";
import { TOY_PARAMETERS } from "./toy-model";

import type { SamplingResult } from "./sampling";

const EXPLAINER = `One predicate over the searched parameters, four ways for the sampler to respect it. Uniform ignores it (the baseline every "prune afterwards" scheme starts from). Rejection redraws until feasible — clean but the attempt count is the bill, and it explodes as the feasible fraction shrinks. Soft is what Optuna's constraints_func gives: the sampler learns to prefer the region but keeps leaking infeasible trials. Construction routes each conjunct to a mechanism that cannot miss — bounds fold into the box, orderings become a gap transform, the affine part is walked as a polytope — and only nonlinear leftovers still reject.

Tighten the constraint and watch rejection's attempts climb while construction stays flat: that is the "shape the space, don't prune it" argument in one picture. The scatter shows the projection onto two chosen parameters; the other parameters are sampled too, and the shading marks the slice through the projection plane at their box midpoints.`;

const DEFAULT_SOURCE =
  "flow_rate <= 2 * cooling_power && flow_rate + cooling_power <= 10 && batch_size <= 30";

const STRATEGIES = ["uniform", "rejection", "soft", "construction"] as const;

type Strategy = (typeof STRATEGIES)[number];

const STRATEGY_LABELS: Record<Strategy, string> = {
  uniform: "Uniform (ignore it)",
  rejection: "Rejection (prune + redraw)",
  soft: "Soft (learned preference)",
  construction: "Construction (transform + walk)",
};

export const SamplingPrototype = () => {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [count, setCount] = useState(400);
  const [seed, setSeed] = useState(7);
  const [xName, setXName] = useState("cooling_power");
  const [yName, setYName] = useState("flow_rate");

  const parsed = parseConstraint(source);

  const xSpec = TOY_PARAMETERS.find((spec) => spec.name === xName)!;
  const ySpec = TOY_PARAMETERS.find((spec) => spec.name === yName)!;

  const plan = parsed.ok ? planConjuncts(parsed.node, TOY_PARAMETERS) : [];
  const fraction = parsed.ok
    ? estimateFeasibleFraction(
        TOY_PARAMETERS,
        parsed.node,
        4000,
        createRng(seed),
      )
    : 0;

  const results: Record<Strategy, SamplingResult> | null = parsed.ok
    ? {
        uniform: sampleUniform(
          TOY_PARAMETERS,
          parsed.node,
          count,
          createRng(seed),
        ),
        rejection: sampleRejection(
          TOY_PARAMETERS,
          parsed.node,
          count,
          createRng(seed),
        ),
        soft: sampleSoftLearning(
          TOY_PARAMETERS,
          parsed.node,
          count,
          createRng(seed),
        ),
        construction: sampleByConstruction(
          TOY_PARAMETERS,
          plan,
          count,
          createRng(seed),
        ),
      }
    : null;

  const midpoints = new Map(
    TOY_PARAMETERS.map((spec) => [spec.name, (spec.min + spec.max) / 2]),
  );

  return (
    <PrototypeShell
      title="4 · Parameter sampling playground"
      explainer={EXPLAINER}
    >
      <Section title="Constraint over the searched parameters">
        <ConstraintInput
          path="constraint-prototypes/sampling.ts"
          value={source}
          onChange={setSource}
          error={parsed.ok ? undefined : parsed.error}
          after={
            parsed.ok ? (
              <Stat
                label="feasible fraction"
                value={`${(fraction * 100).toFixed(1)}%`}
                tone={fraction > 0.05 ? "good" : "bad"}
              />
            ) : undefined
          }
        />
        <Row>
          {plan.map((conjunct, index) => (
            <Stat
              // eslint-disable-next-line react/no-array-index-key -- conjuncts are positional
              key={index}
              label={conjunct.source}
              value={conjunct.kind}
              tone={conjunct.kind === "nonlinear" ? "bad" : "good"}
            />
          ))}
        </Row>
      </Section>

      <Section title="Sampling">
        <Row>
          <Slider
            label="samples"
            value={count}
            min={50}
            max={1500}
            step={50}
            onChange={setCount}
          />
          <Slider
            label="seed"
            value={seed}
            min={1}
            max={40}
            step={1}
            onChange={setSeed}
          />
          <label>
            x{" "}
            <select
              value={xName}
              onChange={(event) => setXName(event.target.value)}
            >
              {TOY_PARAMETERS.map((spec) => (
                <option key={spec.name} value={spec.name}>
                  {spec.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            y{" "}
            <select
              value={yName}
              onChange={(event) => setYName(event.target.value)}
            >
              {TOY_PARAMETERS.map((spec) => (
                <option key={spec.name} value={spec.name}>
                  {spec.name}
                </option>
              ))}
            </select>
          </label>
        </Row>
        {results && parsed.ok ? (
          <>
            <Row>
              {STRATEGIES.map((strategy) => (
                <ScatterPlot
                  key={strategy}
                  title={STRATEGY_LABELS[strategy]}
                  xName={xName}
                  yName={yName}
                  xDomain={[xSpec.min, xSpec.max]}
                  yDomain={[ySpec.min, ySpec.max]}
                  points={results[strategy].points.map((point) => ({
                    x: point[xName]!,
                    y: point[yName]!,
                    ok: satisfies(parsed.node, point),
                  }))}
                  regionTest={(x, y) => {
                    const probe: Record<string, number> = {};
                    for (const [name, value] of midpoints) {
                      probe[name] = value;
                    }
                    probe[xName] = x;
                    probe[yName] = y;
                    return satisfies(parsed.node, probe);
                  }}
                />
              ))}
            </Row>
            <Row>
              {STRATEGIES.map((strategy) => {
                const result = results[strategy];
                return (
                  <Stat
                    key={strategy}
                    label={`${STRATEGY_LABELS[strategy]} — draws / kept / leaked`}
                    value={`${result.attempts} / ${result.points.length} / ${result.infeasible}`}
                    tone={
                      result.infeasible === 0 &&
                      result.points.length >= Math.min(count, 1)
                        ? "good"
                        : undefined
                    }
                  />
                );
              })}
            </Row>
          </>
        ) : null}
      </Section>
    </PrototypeShell>
  );
};
