import { GRID_SIZE } from "../grid-size";

import type { Scenario, SDCPN } from "../types/sdcpn";

/** One scenario of the model: a batch of wheels, and how strict the check is. */
const batchScenario = ({
  id,
  name,
  description,
  wheels,
  initialRunout,
  tolerance,
  maxPasses,
}: {
  id: string;
  name: string;
  description: string;
  wheels: number;
  initialRunout: number;
  tolerance: number;
  maxPasses: number;
}): Scenario => ({
  id,
  name,
  description,
  scenarioParameters: [
    { type: "integer", identifier: "wheels", default: wheels },
    { type: "real", identifier: "initial_runout", default: initialRunout },
    { type: "real", identifier: "tolerance", default: tolerance },
    { type: "integer", identifier: "max_passes", default: maxPasses },
  ],
  parameterOverrides: {
    param__tolerance: "scenario.tolerance",
    param__max_passes: "scenario.max_passes",
  },
  initialState: {
    type: "adhoc",
    content: {
      variables: [
        {
          name: "wheels",
          type: "integer",
          expression: String(wheels),
          exposed: true,
          optimize: null,
        },
        {
          name: "initial_runout",
          type: "real",
          expression: String(initialRunout),
          exposed: true,
          optimize: null,
        },
        {
          name: "tolerance",
          type: "real",
          expression: String(tolerance),
          exposed: true,
          optimize: null,
        },
        {
          name: "max_passes",
          type: "integer",
          expression: String(maxPasses),
          exposed: true,
          optimize: null,
        },
      ],
      netParameters: [
        {
          parameterId: "param__tolerance",
          expression: "scenario.tolerance",
          optimize: null,
        },
        {
          parameterId: "param__max_passes",
          expression: "scenario.max_passes",
          optimize: null,
        },
      ],
      places: {
        place__laced: {
          kind: "coloured",
          variables: [],
          rows: [
            {
              kind: "template",
              count: { expression: "scenario.wheels", optimize: null },
              cells: [
                { expression: "scenario.initial_runout", optimize: null },
                { expression: "0", optimize: null },
              ],
            },
          ],
          sharedColumns: {},
        },
      },
    },
  },
});

/** The mark behind the wheel at the head of the queue: the stand takes it next. */
const nextMark = `
          {index === 0 && (
            <g>
              <rect
                x={cx - cell / 2 + 4}
                y={cy - radius - 20}
                width={cell - 8}
                height={2 * radius + 52}
                rx="8"
                fill="#ffffff"
                stroke="#e67e22"
                strokeWidth="1.2"
              />
              <text
                x={cx - cell / 2 + 11}
                y={cy - radius - 8}
                fontSize="8"
                fontWeight="700"
                letterSpacing="0.6"
                fill="#e67e22"
              >
                NEXT
              </text>
            </g>
          )}`;

/**
 * The visualizer of a place that keeps its wheels side by side. Laced,
 * Accepted and Rejected draw the same rack, each in its own colour and with
 * its own count.
 */
const rackVisualizer = ({
  comment,
  title,
  background,
  ink,
  summary,
  empty,
  next = "",
}: {
  /** The comment that opens the code. */
  comment: string;
  title: string;
  background: string;
  /** The colour of the wheels. */
  ink: string;
  /** The expression of the count shown under the title. */
  summary: string;
  /** What the rack says with no wheel on it. */
  empty: string;
  /** A mark drawn behind one of the wheels. */
  next?: string;
}): string => `${comment}

const { tolerance, max_passes } = parameters;
const count = tokens.length;
const columns = count <= 6 ? 3 : count <= 8 ? 4 : count <= 12 ? 6 : 8;
const rows = count > columns ? 2 : 1;
const cell = 328 / columns;
// A single row has the height for larger wheels.
const radius = Math.min(rows > 1 ? 24 : 34, cell * 0.3);
// Runout is drawn large: 1 mm puts a rim this many pixels off its hub.
const scale = radius * 0.11;
// The spokes meet the rim every 30 degrees.
const a = radius * 0.866;
const b = radius * 0.5;
// The rows sit in the middle of the window, and so does a row that is not
// full when it is the only one.
const pitch = 2 * radius + 42;
const left =
  16 + (rows > 1 ? 0 : ((columns - Math.min(count, columns)) * cell) / 2);
const top = 137 - ((rows - 1) * pitch) / 2;

return (
  <Visualizer.Svg viewBox="0 0 360 240" backgroundColor="${background}">
    <text x="16" y="22" fontSize="13" fontWeight="600" fill="#0f172a">
      ${title}
    </text>
    <text x="16" y="36" fontSize="10.5" fill="#64748b">
      {${summary}}
    </text>
    <line x1="16" y1="44" x2="344" y2="44" stroke="#e2e8f0" />

    {count === 0 && (
      <text x="180" y="146" fontSize="12" fill="#94a3b8" textAnchor="middle">
        ${empty}
      </text>
    )}

    {tokens.slice(0, 16).map((wheel, index) => {
      // The hub, where the green ring is centred too.
      const cx = left + cell * ((index % columns) + 0.5);
      const cy = top + Math.floor(index / columns) * pitch;
      // The centre of the rim, off the hub by the runout.
      const reach = Math.min(wheel.runout, 4) * scale;
      const x = cx + reach * Math.cos(wheel.runout * 9);
      const y = cy + reach * Math.sin(wheel.runout * 9);
      const dots = cx - (max_passes - 1) * 3;

      return (
        <g key={index}>${next}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#86efac"
            strokeWidth={Math.max(1.5, 2 * tolerance * scale)}
          />
          <path
            d={\`
              M\${cx} \${cy}L\${x + radius} \${y} M\${cx} \${cy}L\${x + a} \${y + b}
              M\${cx} \${cy}L\${x + b} \${y + a} M\${cx} \${cy}L\${x} \${y + radius}
              M\${cx} \${cy}L\${x - b} \${y + a} M\${cx} \${cy}L\${x - a} \${y + b}
              M\${cx} \${cy}L\${x - radius} \${y} M\${cx} \${cy}L\${x - a} \${y - b}
              M\${cx} \${cy}L\${x - b} \${y - a} M\${cx} \${cy}L\${x} \${y - radius}
              M\${cx} \${cy}L\${x + b} \${y - a} M\${cx} \${cy}L\${x + a} \${y - b}
            \`}
            stroke="${ink}"
            strokeOpacity="0.35"
            strokeWidth="0.7"
          />
          <circle
            cx={x}
            cy={y}
            r={radius}
            fill="none"
            stroke="${ink}"
            strokeWidth="2"
          />
          <circle cx={cx} cy={cy} r="2.5" fill="${ink}" />
          <text
            x={cx}
            y={cy + radius + 20}
            fontSize="10"
            fill="#334155"
            textAnchor="middle"
          >
            {wheel.runout.toFixed(2)}
            {columns < 8 && " mm"}
          </text>
          <line
            x1={dots}
            y1={cy + radius + 28}
            x2={dots + (max_passes - 1) * 6 + 0.01}
            y2={cy + radius + 28}
            stroke="#cbd5e1"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="0 6"
          />
          {wheel.passes > 0 && (
            <line
              x1={dots}
              y1={cy + radius + 28}
              x2={dots + (Math.min(wheel.passes, max_passes) - 1) * 6 + 0.01}
              y2={cy + radius + 28}
              stroke="#e67e22"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="0 6"
            />
          )}
        </g>
      );
    })}
  </Visualizer.Svg>
);`;

/** The visualizer of Measured: the one wheel just off the stand, and its verdict. */
const gaugeVisualizer = `// The wheel just off the stand, on the gauge. The green ring is as wide as
// the tolerance and centred on the hub, and the rim sits off the hub by the
// runout the pass left. The scale on the right reads the same runout against
// the tolerance, and names the transition that takes the wheel next.

const { tolerance, max_passes } = parameters;
const wheel = tokens[0];
const runout = wheel ? wheel.runout : 0;
const passes = wheel ? wheel.passes : 0;
const within = runout <= tolerance;
const last = passes >= max_passes;
const ink = within ? "#15803d" : last ? "#b91c1c" : "#b45309";
const verdict = within ? "Accept" : last ? "Reject" : "Retrue";
const reason = within
  ? "within tolerance"
  : last
    ? "still out after its last pass"
    : "still out, back to the queue";
// Runout is drawn large: 1 mm puts the rim 8 pixels off its hub.
const reach = Math.min(runout, 4) * 8;
const x = 96 + reach * Math.cos(runout * 9);
const y = 140 + reach * Math.sin(runout * 9);
// The scale runs from 0 to 4 mm over 148 pixels.
const needle = 196 + (Math.min(runout, 4) / 4) * 148;
const zone = (Math.min(tolerance, 4) / 4) * 148;

return (
  <Visualizer.Svg viewBox="0 0 360 240" backgroundColor="#f8fafc">
    <text x="16" y="22" fontSize="13" fontWeight="600" fill="#0f172a">
      On the gauge
    </text>
    <text x="16" y="36" fontSize="10.5" fill="#64748b">
      tolerance {tolerance} mm
    </text>
    <line x1="16" y1="44" x2="344" y2="44" stroke="#e2e8f0" />

    <path
      d="M96 140V231M64 231H128"
      fill="none"
      stroke="#cbd5e1"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <circle
      cx="96"
      cy="140"
      r="58"
      fill="none"
      stroke="#86efac"
      strokeWidth={Math.max(2, 16 * tolerance)}
    />

    {!wheel && (
      <g>
        <circle cx="96" cy="140" r="5" fill="#cbd5e1" />
        <text x="196" y="136" fontSize="13" fontWeight="600" fill="#94a3b8">
          Stand free
        </text>
        <text x="196" y="154" fontSize="10" fill="#94a3b8">
          The next pass puts a wheel here
        </text>
      </g>
    )}

    {wheel && (
      <g>
        <path
          d={\`
            M96 140L\${x + 58} \${y} M96 140L\${x + 50.2} \${y + 29}
            M96 140L\${x + 29} \${y + 50.2} M96 140L\${x} \${y + 58}
            M96 140L\${x - 29} \${y + 50.2} M96 140L\${x - 50.2} \${y + 29}
            M96 140L\${x - 58} \${y} M96 140L\${x - 50.2} \${y - 29}
            M96 140L\${x - 29} \${y - 50.2} M96 140L\${x} \${y - 58}
            M96 140L\${x + 29} \${y - 50.2} M96 140L\${x + 50.2} \${y - 29}
          \`}
          stroke={ink}
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
        <circle cx={x} cy={y} r="58" fill="none" stroke={ink} strokeWidth="4" />
        <circle
          cx={x}
          cy={y}
          r="53.5"
          fill="none"
          stroke={ink}
          strokeOpacity="0.4"
          strokeWidth="1"
        />
        <circle cx="96" cy="140" r="6" fill={ink} />
        <circle cx="96" cy="140" r="2" fill="#f8fafc" />

        <text x="196" y="94">
          <tspan fontSize="32" fontWeight="700" fill={ink}>
            {runout.toFixed(2)}
          </tspan>
          <tspan fontSize="12" fill="#64748b" dx="5">
            mm
          </tspan>
        </text>

        <rect x="196" y="114" width="148" height="8" rx="4" fill="#e2e8f0" />
        <rect x="196" y="114" width={zone} height="8" rx="4" fill="#86efac" />
        <polygon
          points={\`\${needle - 5},103 \${needle + 5},103 \${needle},112\`}
          fill={ink}
        />
        <text x="196" y="136" fontSize="9" fill="#64748b">
          0
        </text>
        <text
          x={196 + zone}
          y="136"
          fontSize="9"
          fill="#15803d"
          textAnchor="middle"
        >
          {tolerance}
        </text>
        <text x="344" y="136" fontSize="9" fill="#64748b" textAnchor="end">
          4 mm
        </text>

        <rect
          x="196"
          y="150"
          width="148"
          height="42"
          rx="8"
          fill={ink}
          fillOpacity="0.1"
        />
        <text x="208" y="169" fontSize="14" fontWeight="700" fill={ink}>
          {verdict}
        </text>
        <text x="208" y="183" fontSize="10" fill="#475569">
          {reason}
        </text>

        <text x="196" y="215" fontSize="10" fill="#64748b">
          Pass {passes} of {max_passes}
        </text>
        <line
          x1="262"
          y1="211.5"
          x2={262 + (max_passes - 1) * 9 + 0.01}
          y2="211.5"
          stroke="#cbd5e1"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="0 9"
        />
        {passes > 0 && (
          <line
            x1="262"
            y1="211.5"
            x2={262 + (Math.min(passes, max_passes) - 1) * 9 + 0.01}
            y2="211.5"
            stroke="#e67e22"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="0 9"
          />
        )}
      </g>
    )}
  </Visualizer.Svg>
);`;

/**
 * Wheel Truing: an untimed net of typed tokens whose runs differ by seed. A
 * batch of freshly laced wheels goes over one truing stand until each wheel
 * is within tolerance or has had its last pass.
 *
 * Every transition is a predicate and no place has dynamics, so nothing
 * takes time and a run is a sequence of steps. The chance is in a kernel:
 * TruingPass draws the runout a pass leaves from `Distribution.Gaussian`,
 * around a share of the runout the wheel came with. The three predicates
 * that follow read the measured wheel and send it one of three ways.
 *
 * - TruingPass takes the wheel at the head of Laced, draws its new runout
 *   and counts the pass.
 * - Accept fires for a wheel within `tolerance`.
 * - Retrue sends a wheel that is still out, with passes left, back to Laced.
 * - Reject takes a wheel that is still out after `max_passes`.
 *
 * A transition fires once per step, so the stand trues one wheel per step
 * and a wheel is measured the step after its pass. The run ends at the first
 * step that fires nothing: every wheel is then Accepted or Rejected.
 *
 * One run is one batch. A Stochastic simulation runs many batches and counts
 * them by step: the mean of Accepted climbs to the batch's expected yield.
 *
 * Every place has a visualizer. A wheel is drawn with the green ring its rim
 * has to stay in, as wide as the tolerance and centred on the hub, and its
 * rim sits off the hub by the wheel's runout. Laced shows the queue, Measured
 * the wheel on the gauge with the transition that takes it next, and
 * Accepted and Rejected their racks.
 *
 * Every place has a capacity, so the net is ready for the GPU as shipped.
 */
export const wheelTruing: { title: string; petriNetDefinition: SDCPN } = {
  title: "Wheel Truing",
  petriNetDefinition: {
    description:
      "An untimed net of typed tokens: laced wheels go over a truing stand until each is within tolerance or out of passes. Every transition is a predicate, so the run is a sequence of steps, and the runout a pass leaves is drawn from a distribution in the transition's kernel, so a run depends on its seed.",
    places: [
      {
        id: "place__laced",
        name: "Laced",
        description:
          "Wheels waiting for a pass on the truing stand, each with its runout in millimetres and the passes it has had. Holds up to 16 wheels.",
        visualizerCode: rackVisualizer({
          comment: `// The queue for the truing stand, head first. Each wheel is drawn with the
// green ring its rim has to stay in: the ring is as wide as the tolerance and
// centred on the hub, and the rim sits off the hub by the wheel's runout. The
// dots count the passes the wheel has had, out of the passes it may have.`,
          title: "Queue for the stand",
          background: "#f8fafc",
          ink: "#334155",
          summary: 'count + " waiting"',
          empty: "No wheel is waiting",
          next: nextMark,
        }),
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        showAsInitialState: true,
        x: -32 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__measured",
        name: "Measured",
        description:
          "Wheels just off the stand, carrying the runout the pass left. One of Accept, Retrue and Reject takes each. Holds up to 16 wheels.",
        visualizerCode: gaugeVisualizer,
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        x: 0 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__accepted",
        name: "Accepted",
        description: "Wheels within tolerance. Holds up to 16 wheels.",
        visualizerCode: rackVisualizer({
          comment: `// The wheels within tolerance. Each rim stays in its green ring: the ring is
// as wide as the tolerance and centred on the hub, and the rim sits off the
// hub by the wheel's runout. The dots count the passes the wheel took.`,
          title: "Accepted",
          background: "#f0fdf4",
          ink: "#15803d",
          summary:
            'count === 0 ? "none yet" : count + " accepted · " + (tokens.reduce((sum, wheel) => sum + wheel.passes, 0) / count).toFixed(1) + " passes each"',
          empty: "No wheel accepted yet",
        }),
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        x: 32 * GRID_SIZE,
        y: -10 * GRID_SIZE,
      },
      {
        id: "place__rejected",
        name: "Rejected",
        description:
          "Wheels still out of tolerance after their last pass. Holds up to 16 wheels.",
        visualizerCode: rackVisualizer({
          comment: `// The wheels still out of tolerance after their last pass. Each rim leaves
// its green ring: the ring is as wide as the tolerance and centred on the
// hub, and the rim sits off the hub by the wheel's runout.`,
          title: "Rejected",
          background: "#fef2f2",
          ink: "#b91c1c",
          summary:
            'count === 0 ? "none" : count + " rejected · worst " + tokens.reduce((worst, wheel) => Math.max(worst, wheel.runout), 0).toFixed(2) + " mm"',
          empty: "No wheel rejected",
        }),
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        x: 32 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__truing_pass",
        name: "TruingPass",
        description:
          "One pass on the truing stand. It fires once per step while a wheel is waiting, and its kernel draws the runout the pass leaves.",
        inputArcs: [{ placeId: "place__laced", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__measured", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Always holds: the stand takes the next wheel as soon as one is waiting.

return true;`,
        transitionKernelCode: `// A pass leaves about (1 - correction) of the wobble, give or take: the new
// runout is drawn around that share of the old one, so a careless pass can
// leave a wheel worse than it found it. A wheel is never left perfect.

const wheel = input.Laced[0];
const runout = Distribution.Gaussian(
  wheel.runout * (1 - parameters.correction),
  wheel.runout * parameters.spread,
);

return {
  Measured: [
    {
      runout: runout.map((measured) => Math.max(0.05, measured)),
      passes: wheel.passes + 1,
    },
  ],
};`,
        x: -16 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "transition__accept",
        name: "Accept",
        description: "Takes a measured wheel whose runout is within tolerance.",
        inputArcs: [
          { placeId: "place__measured", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__accepted", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Holds for a wheel within tolerance.

return input.Measured[0].runout <= parameters.tolerance;`,
        transitionKernelCode: `// The wheel moves on as it is.

const wheel = input.Measured[0];

return {
  Accepted: [{ runout: wheel.runout, passes: wheel.passes }],
};`,
        x: 16 * GRID_SIZE,
        y: -10 * GRID_SIZE,
      },
      {
        id: "transition__retrue",
        name: "Retrue",
        description:
          "Sends a wheel that is still out of tolerance, with passes left, back to the stand's queue.",
        inputArcs: [
          { placeId: "place__measured", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__laced", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Holds for a wheel that is still out and has a pass left.

const wheel = input.Measured[0];

return wheel.runout > parameters.tolerance && wheel.passes < parameters.max_passes;`,
        transitionKernelCode: `// The wheel goes back to the queue with its runout and its count of passes.

const wheel = input.Measured[0];

return {
  Laced: [{ runout: wheel.runout, passes: wheel.passes }],
};`,
        x: -16 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "transition__reject",
        name: "Reject",
        description:
          "Takes a wheel that is still out of tolerance after its last pass.",
        inputArcs: [
          { placeId: "place__measured", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__rejected", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Holds for a wheel that is still out and has had its last pass.

const wheel = input.Measured[0];

return wheel.runout > parameters.tolerance && wheel.passes >= parameters.max_passes;`,
        transitionKernelCode: `// The wheel leaves the line as it is.

const wheel = input.Measured[0];

return {
  Rejected: [{ runout: wheel.runout, passes: wheel.passes }],
};`,
        x: 16 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
    ],
    types: [
      {
        id: "type__wheel",
        name: "Wheel",
        description:
          "A bicycle wheel, tracked by its runout (the wobble of the rim, in millimetres) and the truing passes it has had.",
        iconSlug: "circle",
        displayColor: "#E67E22",
        elements: [
          {
            elementId: "element__runout",
            name: "runout",
            type: "real",
          },
          {
            elementId: "element__passes",
            name: "passes",
            type: "integer",
          },
        ],
      },
    ],
    differentialEquations: [],
    parameters: [
      {
        id: "param__tolerance",
        name: "Tolerance",
        variableName: "tolerance",
        type: "real",
        defaultValue: "0.5",
      },
      {
        id: "param__max_passes",
        name: "Max Passes",
        variableName: "max_passes",
        type: "integer",
        defaultValue: "4",
      },
      {
        id: "param__correction",
        name: "Correction",
        variableName: "correction",
        type: "real",
        defaultValue: "0.45",
      },
      {
        id: "param__spread",
        name: "Spread",
        variableName: "spread",
        type: "real",
        defaultValue: "0.25",
      },
    ],
    scenarios: [
      batchScenario({
        id: "scenario__batch_of_six",
        name: "Batch of Six",
        description:
          "Six wheels laced 3 mm out, a tolerance of 0.5 mm and at most four passes each. Run it as a Stochastic simulation to read the expected yield by step.",
        wheels: 6,
        initialRunout: 3,
        tolerance: 0.5,
        maxPasses: 4,
      }),
      batchScenario({
        id: "scenario__tight_tolerance",
        name: "Tight Tolerance",
        description:
          "The same batch held to 0.25 mm: most wheels use every pass, and fewer make it.",
        wheels: 6,
        initialRunout: 3,
        tolerance: 0.25,
        maxPasses: 4,
      }),
    ],
    metrics: [
      {
        id: "metric__yield",
        name: "Yield",
        description: "Share of the wheels done so far that were accepted.",
        code: `const accepted = state.places.Accepted.count;
const done = accepted + state.places.Rejected.count;
return done === 0 ? 0 : accepted / done;`,
      },
      {
        id: "metric__passes_per_accepted_wheel",
        name: "Passes per accepted wheel",
        description: "Mean number of truing passes an accepted wheel took.",
        code: `const accepted = state.places.Accepted.count;
if (accepted === 0) return 0;
return state.places.Accepted.tokens.reduce((sum, wheel) => sum + wheel.passes, 0) / accepted;`,
      },
    ],
  },
};
