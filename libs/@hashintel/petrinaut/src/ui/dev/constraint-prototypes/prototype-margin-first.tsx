/**
 * Prototype 2 — "Margin-first". The user authors the margin expression
 * itself — a NUMBER that must stay `>= 0` — instead of a boolean predicate.
 * The RFC's canonical form becomes the authoring surface: `80 -
 * temperature` rather than `temperature < 80`. Typing a comparison anyway
 * is fine — the rewrite chip shows the canonical margin and one click
 * adopts it. The gain is that "distance to the boundary" is explicit and
 * the user controls its units and scale; the cost is asking users to think
 * in slack.
 */

import { useState } from "react";

import { CurvePlot, MarginStrip, TracePlot } from "./charts";
import {
  canonicalMarginExpr,
  evaluateExpression,
  printExpression,
} from "./expr";
import { penaltyMultiplier } from "./robustness";
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

const EXPLAINER = `Here the constraint IS the margin: a numeric expression that must stay at or above zero. "Temperature stays below 80" is authored as 80 - temperature — the number of degrees to spare, at every step. Satisfaction, violation depth, and the objective multiplier all read directly off the value the user wrote, so nothing is implicit.

The reference scale divides the margin before scoring, which is what makes two constraints with different units (degrees vs bar) comparable when they are combined — the RFC's normalisation step, surfaced as an authoring control. Type a boolean comparison instead and the chip offers its canonical margin rewrite.`;

/** Margin authoring wants numbers; flag boolean-shaped roots. */
function isBooleanShaped(parsed: { ok: true; node: ExprNode }): boolean {
  const node = parsed.node;
  return (
    node.kind === "boolean" ||
    (node.kind === "binary" &&
      ["<", "<=", ">", ">=", "==", "!=", "&&", "||"].includes(node.op)) ||
    (node.kind === "unary" && node.op === "!")
  );
}

export const MarginFirstPrototype = () => {
  const [source, setSource] = useState("80 - temperature");
  const [scale, setScale] = useState(80);
  const [parameters, setParameters] = useState(TOY_DEFAULTS);
  const [width, setWidth] = useState(0.15);
  const [kind, setKind] = useState<PenaltyKind>("exponential");

  const trace = simulateToyRun(parameters);
  const parsed = parseConstraint(source);

  const rewrite =
    parsed.ok && isBooleanShaped(parsed)
      ? canonicalMarginExpr(parsed.node)
      : null;

  const margins =
    parsed.ok && !isBooleanShaped(parsed)
      ? trace.steps.map((step) => {
          const value = evaluateExpression(parsed.node, step);
          return typeof value === "number" ? value : value ? 1 : 0;
        })
      : null;
  const normalized =
    margins === null
      ? null
      : margins.map((value) => value / Math.max(scale, 1e-9));
  const robustness = normalized === null ? null : Math.min(...normalized);
  const objective = toyObjective(trace);
  const multiplier =
    robustness === null ? 1 : penaltyMultiplier(robustness, width, kind);

  return (
    <PrototypeShell title="2 · Margin-first" explainer={EXPLAINER}>
      <Section title="Margin expression (a number that must stay ≥ 0)">
        <ConstraintInput
          path="constraint-prototypes/margin-first.ts"
          value={source}
          onChange={setSource}
          error={
            !parsed.ok
              ? parsed.error
              : isBooleanShaped(parsed)
                ? "This is a boolean — a margin is a number. Use the rewrite below."
                : undefined
          }
          after={
            robustness !== null ? (
              <Stat
                label="min margin"
                value={robustness.toFixed(3)}
                tone={robustness >= 0 ? "good" : "bad"}
              />
            ) : undefined
          }
        />
        {rewrite ? (
          <Row>
            <Stat label="canonical margin" value={printExpression(rewrite)} />
            <button
              type="button"
              onClick={() => setSource(printExpression(rewrite))}
            >
              Use as margin
            </button>
          </Row>
        ) : null}
        <Row>
          <Slider
            label="reference scale (units per 1.0)"
            value={scale}
            min={1}
            max={200}
            step={1}
            onChange={setScale}
          />
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

      {parsed.ok && normalized ? (
        <Section title="The margin over the run (normalised)">
          <TracePlot
            times={trace.times}
            series={[{ name: "margin / scale", values: normalized }]}
            band={{ min: 0 }}
            violations={normalized.map((value) => value < 0)}
          />
          <MarginStrip values={normalized} />
        </Section>
      ) : null}

      <Section title="From margin to the objective">
        <Row>
          <label>
            decay{" "}
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as PenaltyKind)}
            >
              <option value="exponential">exponential (1 inside)</option>
              <option value="logistic">logistic (discounts the edge)</option>
              <option value="hard">hard cut</option>
            </select>
          </label>
          <Slider
            label="tolerance width"
            value={width}
            min={0.02}
            max={1}
            step={0.01}
            onChange={setWidth}
          />
        </Row>
        <Row>
          <CurvePlot
            domain={[-3 * width, 3 * width]}
            fn={(margin) => penaltyMultiplier(margin, width, kind)}
            marker={robustness ?? undefined}
            label="objective multiplier vs normalised margin"
          />
          <div>
            <Row>
              <Stat label="objective" value={objective.toFixed(2)} />
              <Stat label="multiplier" value={multiplier.toFixed(3)} />
            </Row>
            <Row>
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
