import type { SDCPN } from "../types/sdcpn";

/**
 * Software release pipeline with a single-deployment safety gate and an
 * incident feedback loop.
 *
 * Deployments and incidents arrive from source transitions at stochastic rates.
 * "Start Deployment" uses inhibitor arcs from IncidentBeingInvestigated and
 * DeploymentInProgress so a release can only begin when no incident is open and
 * no other deployment is running. In-progress deployments either finish
 * successfully or trigger "Deployment Causes Incident", which records a failure
 * and opens a new incident that re-closes the gate. Deployment `size` is sampled
 * lognormally and `risk`/`severity` are sampled with Gaussian noise (clamped via
 * `.map()`); larger/riskier releases finish more slowly and fail more often.
 *
 * Ships with per-place SVG visualizers, metrics (success/failure counts, queue
 * length, gate-blocked flag, failure share), and four scenarios. See
 * `docs/examples.md` (Deployment Pipeline).
 */
export const deploymentPipelineSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Deployment Pipeline",
  petriNetDefinition: {
    places: [
      {
        id: "place__deployment-ready",
        name: "DeploymentReady",
        colorId: "type__deployment",
        dynamicsEnabled: true,
        differentialEquationId: "dynamics__deployment_age",
        x: 180,
        y: 0,
        visualizerCode: `// Release queue: one card per deployment waiting to start. Card colour goes
// green -> amber -> red with the deployment's risk, and width scales with its
// size, so a glance shows how risky/large the backlog is.
export default Visualization(({ tokens }) => {
  const width = 380;
  const height = 170;
  const visible = tokens.slice(0, 20);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "6px" }}>
      <rect width={width} height={height} rx="10" fill="#eff6ff" />
      <text x="18" y="28" fill="#1e3a8a" fontSize="18" fontWeight="700">Release queue</text>
      <text x="18" y="50" fill="#2563eb" fontSize="13">{tokens.length} waiting; hotter cards are riskier</text>
      {visible.map((deployment, index) => {
        const risk = Math.max(0, Math.min(1, deployment.risk));
        const size = Math.max(0.4, Math.min(2.2, deployment.size));
        const x = 18 + (index % 10) * 34;
        const y = 68 + Math.floor(index / 10) * 42;
        const fill = risk < 0.25 ? "#22c55e" : risk < 0.55 ? "#f59e0b" : "#ef4444";
        return (
          <g key={index}>
            <rect x={x} y={y} width={22 * size} height="28" rx="4" fill={fill} stroke="#1e3a8a" strokeWidth="1" opacity="0.9" />
            <text x={x + 5} y={y + 19} fill="white" fontSize="12" fontWeight="700">{Math.round(risk * 100)}</text>
          </g>
        );
      })}
    </svg>
  );
});`,
        showAsInitialState: true,
      },
      {
        id: "place__incident-being-investigated",
        name: "IncidentBeingInvestigated",
        colorId: "type__incident",
        dynamicsEnabled: true,
        differentialEquationId: "dynamics__incident_age",
        x: 675,
        y: 510,
        visualizerCode: `// Incident bridge: one bar per open incident, taller and darker with severity.
// Because this place feeds an inhibitor arc into Start Deployment, any bar
// shown here means the deployment gate is currently closed.
export default Visualization(({ tokens }) => {
  const width = 380;
  const height = 170;
  const visible = tokens.slice(0, 10);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "6px" }}>
      <rect width={width} height={height} rx="10" fill="#fff1f2" />
      <text x="18" y="30" fill="#991b1b" fontSize="18" fontWeight="700">Incident bridge</text>
      <text x="18" y="52" fill="#dc2626" fontSize="13">Inhibits new deployments while any card is present</text>
      {visible.length === 0 && <text x="18" y="98" fill="#16a34a" fontSize="18">No active incident — deploy gate open</text>}
      {visible.map((incident, index) => {
        const sev = Math.max(0, Math.min(1, incident.severity));
        const x = 20 + index * 34;
        const h = 24 + sev * 52;
        const y = 142 - h;
        return (
          <g key={index}>
            <rect x={x} y={y} width="24" height={h} rx="5" fill={sev < 0.35 ? "#fb923c" : sev < 0.7 ? "#ef4444" : "#7f1d1d"} />
            <text x={x + 6} y={y - 5} fill="#991b1b" fontSize="11" fontWeight="700">S{Math.ceil(sev * 5)}</text>
          </g>
        );
      })}
    </svg>
  );
});`,
        showAsInitialState: true,
      },
      {
        id: "place__deployment-in-progress",
        name: "DeploymentInProgress",
        colorId: "type__deployment",
        dynamicsEnabled: true,
        differentialEquationId: "dynamics__deployment_age",
        x: 150,
        y: 315,
        visualizerCode: `// Deployment lane: shows the single in-progress deployment as a progress bar
// (estimated from its age relative to size), coloured by risk. Empty when the
// lane is idle — the inhibitor arc allows only one deployment at a time.
export default Visualization(({ tokens }) => {
  const width = 380;
  const height = 170;
  const deployment = tokens[0];
  const risk = deployment ? Math.max(0, Math.min(1, deployment.risk)) : 0;
  const age = deployment ? deployment.age : 0;
  const size = deployment ? deployment.size : 0;
  const progress = deployment ? Math.max(0.08, Math.min(1, age / Math.max(1, size * 6))) : 0;
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "6px" }}>
      <rect width={width} height={height} rx="10" fill="#ecfeff" />
      <text x="18" y="30" fill="#155e75" fontSize="18" fontWeight="700">Deployment lane</text>
      {!deployment && <text x="18" y="88" fill="#0891b2" fontSize="18">Idle — ready for next safe release</text>}
      {deployment && (
        <g>
          <rect x="24" y="70" width="318" height="30" rx="15" fill="#cffafe" stroke="#0891b2" />
          <rect x="24" y="70" width={318 * progress} height="30" rx="15" fill={risk < 0.35 ? "#06b6d4" : risk < 0.65 ? "#f59e0b" : "#ef4444"} />
          <circle cx={24 + 318 * progress} cy="85" r="19" fill="#ffffff" stroke="#155e75" strokeWidth="3" />
          <text x={24 + 318 * progress - 8} y="91" fill="#155e75" fontSize="18" fontWeight="700">▶</text>
          <text x="24" y="130" fill="#155e75" fontSize="14">size {size.toFixed(2)} · risk {Math.round(risk * 100)}% · age {age.toFixed(1)}s</text>
        </g>
      )}
    </svg>
  );
});`,
        showAsInitialState: true,
      },
      {
        id: "place__completed-deployments",
        name: "CompletedDeployments",
        colorId: "type__deployment",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 825,
        y: 210,
        visualizerCode: `// Successful releases: a tally of completed deployments (most recent last).
// Each green check is one deployment that finished without causing an incident.
export default Visualization(({ tokens }) => {
  const width = 360;
  const height = 160;
  const visible = tokens.slice(-24);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "6px" }}>
      <rect width={width} height={height} rx="10" fill="#f0fdf4" />
      <text x="18" y="30" fill="#166534" fontSize="18" fontWeight="700">Successful releases</text>
      <text x="18" y="54" fill="#16a34a" fontSize="13">{tokens.length} completed deployments</text>
      {visible.map((deployment, index) => {
        const x = 18 + (index % 12) * 27;
        const y = 74 + Math.floor(index / 12) * 31;
        return (
          <g key={index}>
            <rect x={x} y={y} width="21" height="23" rx="4" fill="#22c55e" stroke="#166534" />
            <path d={\`M \${x + 5} \${y + 12} L \${x + 9} \${y + 17} L \${x + 17} \${y + 7}\`} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
});`,
        showAsInitialState: true,
      },
      {
        id: "place__resolved-incidents",
        name: "ResolvedIncidents",
        colorId: "type__incident",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 1170,
        y: 510,
        visualizerCode: `// Closed incidents: a tally of resolved incident tickets (most recent last).
export default Visualization(({ tokens }) => {
  const width = 340;
  const height = 150;
  const visible = tokens.slice(-18);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "6px" }}>
      <rect width={width} height={height} rx="10" fill="#f8fafc" />
      <text x="18" y="30" fill="#334155" fontSize="18" fontWeight="700">Closed incidents</text>
      <text x="18" y="52" fill="#64748b" fontSize="13">{tokens.length} resolved tickets</text>
      {visible.map((incident, index) => {
        const x = 18 + (index % 9) * 34;
        const y = 72 + Math.floor(index / 9) * 30;
        return (
          <g key={index}>
            <rect x={x} y={y} width="25" height="20" rx="3" fill="#e2e8f0" stroke="#64748b" />
            <line x1={x + 5} y1={y + 10} x2={x + 20} y2={y + 10} stroke="#64748b" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
});`,
        showAsInitialState: true,
      },
      {
        id: "place__failed-deployments",
        name: "FailedDeployments",
        colorId: "type__deployment",
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: `// Failed releases: deployments that rolled back and opened an incident. The
// red cross marks each failure and its outline thickens with the deployment's
// risk, so the riskiest failures stand out.
export default Visualization(({ tokens }) => {
  const width = 360;
  const height = 160;
  const visible = tokens.slice(-18);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "6px" }}>
      <rect width={width} height={height} rx="10" fill="#1f2937" />
      <text x="18" y="30" fill="#fecaca" fontSize="18" fontWeight="700">Failed releases</text>
      <text x="18" y="54" fill="#fca5a5" fontSize="13">{tokens.length} rollback / incident-generating deploys</text>
      {visible.map((deployment, index) => {
        const x = 18 + (index % 9) * 36;
        const y = 76 + Math.floor(index / 9) * 34;
        const risk = Math.max(0, Math.min(1, deployment.risk));
        return (
          <g key={index}>
            <rect x={x} y={y} width="26" height="22" rx="4" fill="#991b1b" stroke="#fecaca" strokeWidth={1 + risk * 2} />
            <line x1={x + 7} y1={y + 6} x2={x + 19} y2={y + 16} stroke="#fee2e2" strokeWidth="2" />
            <line x1={x + 19} y1={y + 6} x2={x + 7} y2={y + 16} stroke="#fee2e2" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 870,
        y: 330,
      },
    ],
    transitions: [
      {
        id: "transition__create-deployment",
        name: "Create Deployment",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place__deployment-ready",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `/**
 * Deployment arrivals.
 *
 * This stochastic lambda returns the expected number of new deployment
 * candidates created per simulation second. The transition has no input
 * places, so it behaves like an external arrival process feeding the
 * DeploymentReady queue.
 */
export default Lambda((input, parameters) => {
  return parameters.deployment_creation_rate;
});`,
        transitionKernelCode: `/**
 * Create one coloured Deployment token.
 *
 * - size is sampled from a lognormal distribution so most releases are
 *   ordinary, with occasional large releases.
 * - risk is sampled from a Gaussian distribution and clamped to [0.02, 0.95]
 *   so every deployment has some risk but never exceeds a probability-like cap.
 * - age starts at zero and is advanced by the Deployment Age dynamics while the
 *   token waits or runs.
 */
export default TransitionKernel((input, parameters) => {
  const size = Distribution.Lognormal(Math.log(Math.max(0.1, parameters.mean_deployment_size)), 0.35);
  const rawRisk = Distribution.Gaussian(0.28 * parameters.deployment_risk_multiplier, 0.16);
  return {
    DeploymentReady: [
      {
        size,
        risk: rawRisk.map(r => Math.max(0.02, Math.min(0.95, r))),
        age: 0,
      },
    ],
  };
});`,
        x: -90,
        y: 0,
      },
      {
        id: "transition__incident-raised",
        name: "Incident Raised",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place__incident-being-investigated",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `/**
 * External incident arrivals.
 *
 * This stochastic lambda models incidents raised independently of deployments,
 * such as infrastructure failures or customer-impacting issues. Each firing
 * creates one IncidentBeingInvestigated token, which then blocks the deployment
 * start gate via the inhibitor arc.
 */
export default Lambda((input, parameters) => {
  return parameters.incident_rate;
});`,
        transitionKernelCode: `/**
 * Create one coloured Incident token.
 *
 * Severity is sampled around the configured incident severity multiplier and
 * clamped to [0.05, 1]. Higher-severity incidents resolve more slowly in the
 * Close Incident transition, so this sampled attribute affects later dynamics.
 */
export default TransitionKernel((input, parameters) => {
  const rawSeverity = Distribution.Gaussian(0.45 * parameters.incident_severity_multiplier, 0.2);
  return {
    IncidentBeingInvestigated: [
      {
        severity: rawSeverity.map(s => Math.max(0.05, Math.min(1, s))),
        age: 0,
      },
    ],
  };
});`,
        x: 450,
        y: 585,
      },
      {
        id: "transition__start-deployment",
        name: "Start Deployment",
        inputArcs: [
          {
            placeId: "place__deployment-ready",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place__incident-being-investigated",
            weight: 1,
            type: "inhibitor",
          },
          {
            placeId: "place__deployment-in-progress",
            weight: 1,
            type: "inhibitor",
          },
        ],
        outputArcs: [
          {
            placeId: "place__deployment-in-progress",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `/**
 * Safety-gated deployment start.
 *
 * The boolean logic is intentionally simple: if the transition is enabled by
 * the Petri-net arcs, it may fire. The important behaviour is in the arcs:
 * - DeploymentReady is a standard input arc, so one queued deployment is consumed.
 * - IncidentBeingInvestigated is an inhibitor arc, so any active incident blocks firing.
 * - DeploymentInProgress is an inhibitor arc, so only one deployment may run at a time.
 */
export default Lambda(() => true);`,
        transitionKernelCode: `/**
 * Move a deployment from the ready queue into the in-progress lane.
 *
 * The deployment's size and risk are preserved. Age is reset to zero so the
 * in-progress visualizer and downstream completion/failure logic can interpret
 * age as time spent running rather than time spent waiting in the queue.
 */
export default TransitionKernel((input) => {
  const deployment = input.DeploymentReady[0];
  return {
    DeploymentInProgress: [
      {
        size: deployment.size,
        risk: deployment.risk,
        age: 0,
      },
    ],
  };
});`,
        x: 480,
        y: 0,
      },
      {
        id: "transition__finish-deployment",
        name: "Finish Deployment",
        inputArcs: [
          {
            placeId: "place__deployment-in-progress",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__completed-deployments",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `/**
 * Successful deployment completion rate.
 *
 * The returned rate is in expected firings per simulation second for the
 * specific DeploymentInProgress token being considered. Larger deployments
 * complete more slowly, and risky deployments get a modest slowdown to represent
 * extra validation, caution, or late-stage friction.
 */
export default Lambda((input, parameters) => {
  const deployment = input.DeploymentInProgress[0];
  const sizePenalty = Math.max(0.25, deployment.size);
  const riskPenalty = Math.max(0.15, 1 - deployment.risk * 0.45);
  return parameters.deployment_finish_base_rate * riskPenalty / sizePenalty;
});`,
        transitionKernelCode: `/**
 * Record a successful deployment.
 *
 * The token's attributes are copied into CompletedDeployments so visualizers and
 * metrics can still inspect the size, risk, and elapsed run age of releases that
 * made it through the pipeline.
 */
export default TransitionKernel((input) => {
  const deployment = input.DeploymentInProgress[0];
  return {
    CompletedDeployments: [
      {
        size: deployment.size,
        risk: deployment.risk,
        age: deployment.age,
      },
    ],
  };
});`,
        x: 480,
        y: 165,
      },
      {
        id: "transition__close-incident",
        name: "Close Incident",
        inputArcs: [
          {
            placeId: "place__incident-being-investigated",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__resolved-incidents",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `/**
 * Incident resolution rate.
 *
 * Each active incident is considered separately. High-severity incidents resolve
 * more slowly, because severity appears in the denominator. Once the final
 * incident leaves IncidentBeingInvestigated, the inhibitor arc on Start
 * Deployment no longer blocks the release gate.
 */
export default Lambda((input, parameters) => {
  const incident = input.IncidentBeingInvestigated[0];
  return parameters.incident_resolution_rate / Math.max(0.2, incident.severity);
});`,
        transitionKernelCode: `/**
 * Move an incident to the resolved archive.
 *
 * Severity and age are preserved so the resolved incident pile can show the
 * history of operational load, even though resolved incidents no longer block
 * deployments.
 */
export default TransitionKernel((input) => {
  const incident = input.IncidentBeingInvestigated[0];
  return {
    ResolvedIncidents: [
      {
        severity: incident.severity,
        age: incident.age,
      },
    ],
  };
});`,
        x: 930,
        y: 510,
      },
      {
        id: "transition__deployment-causes-incident",
        name: "Deployment Causes Incident",
        inputArcs: [
          {
            placeId: "place__deployment-in-progress",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__failed-deployments",
            weight: 1,
          },
          {
            placeId: "place__incident-being-investigated",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `/**
 * Deployment failure / incident-generation rate.
 *
 * This is the competing stochastic outcome to Finish Deployment. Riskier and
 * larger deployments are more likely to fail, and the scenario-level risk
 * multiplier can make the whole release environment safer or more dangerous.
 * When this fires, the in-progress deployment is consumed and an incident is
 * opened, which then blocks future starts through the inhibitor arc.
 */
export default Lambda((input, parameters) => {
  const deployment = input.DeploymentInProgress[0];
  const risk = Math.max(0, Math.min(1, deployment.risk));
  const size = Math.max(0.25, deployment.size);
  return parameters.deployment_failure_base_rate * parameters.deployment_risk_multiplier * risk * size;
});`,
        transitionKernelCode: `/**
 * Turn a failed deployment into both an audit record and an active incident.
 *
 * The failed deployment is copied to FailedDeployments for counting and display.
 * A new Incident token is created with severity derived from deployment risk,
 * plus Gaussian noise. The severity is clamped to [0.05, 1] so incident handling
 * remains numerically stable and visually interpretable.
 */
export default TransitionKernel((input, parameters) => {
  const deployment = input.DeploymentInProgress[0];
  const rawSeverity = Distribution.Gaussian(
    Math.min(1, 0.25 + deployment.risk * 0.65 * parameters.incident_severity_multiplier),
    0.12
  );
  return {
    FailedDeployments: [
      {
        size: deployment.size,
        risk: deployment.risk,
        age: deployment.age,
      },
    ],
    IncidentBeingInvestigated: [
      {
        severity: rawSeverity.map(s => Math.max(0.05, Math.min(1, s))),
        age: 0,
      },
    ],
  };
});`,
        x: 450,
        y: 405,
      },
    ],
    types: [
      {
        id: "type__deployment",
        name: "Deployment",
        iconSlug: "rocket",
        displayColor: "#2563eb",
        elements: [
          {
            elementId: "deployment__size",
            name: "size",
            type: "real",
          },
          {
            elementId: "deployment__risk",
            name: "risk",
            type: "real",
          },
          {
            elementId: "deployment__age",
            name: "age",
            type: "real",
          },
        ],
      },
      {
        id: "type__incident",
        name: "Incident",
        iconSlug: "alert-triangle",
        displayColor: "#dc2626",
        elements: [
          {
            elementId: "incident__severity",
            name: "severity",
            type: "real",
          },
          {
            elementId: "incident__age",
            name: "age",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "dynamics__deployment_age",
        name: "Deployment Age",
        colorId: "type__deployment",
        code: `// A simple clock: every deployment's age increases at rate 1 (size and risk
// are fixed at creation, so their derivatives are 0). Age is used to estimate
// progress in the deployment-lane visualizer.
export default Dynamics((tokens) => {
  return tokens.map(() => ({
    size: 0,
    risk: 0,
    age: 1,
  }));
});`,
      },
      {
        id: "dynamics__incident_age",
        name: "Incident Age",
        colorId: "type__incident",
        code: `// Clock for incidents: age rises at rate 1 while severity stays fixed. Older,
// higher-severity incidents take longer to resolve in the Close Incident rate.
export default Dynamics((tokens) => {
  return tokens.map(() => ({
    severity: 0,
    age: 1,
  }));
});`,
      },
    ],
    parameters: [
      {
        id: "param__deployment_creation_rate",
        name: "Deployment Creation Rate",
        variableName: "deployment_creation_rate",
        type: "real",
        defaultValue: "0.5",
      },
      {
        id: "param__incident_rate",
        name: "Incident Rate",
        variableName: "incident_rate",
        type: "real",
        defaultValue: "0.1",
      },
      {
        id: "param__incident_resolution_rate",
        name: "Incident Resolution Rate",
        variableName: "incident_resolution_rate",
        type: "real",
        defaultValue: "0.3",
      },
      {
        id: "param__deployment_finish_base_rate",
        name: "Deployment Finish Base Rate",
        variableName: "deployment_finish_base_rate",
        type: "real",
        defaultValue: "0.35",
      },
      {
        id: "param__deployment_failure_base_rate",
        name: "Deployment Failure Base Rate",
        variableName: "deployment_failure_base_rate",
        type: "real",
        defaultValue: "0.04",
      },
      {
        id: "param__deployment_risk_multiplier",
        name: "Deployment Risk Multiplier",
        variableName: "deployment_risk_multiplier",
        type: "real",
        defaultValue: "1",
      },
      {
        id: "param__mean_deployment_size",
        name: "Mean Deployment Size",
        variableName: "mean_deployment_size",
        type: "real",
        defaultValue: "1",
      },
      {
        id: "param__incident_severity_multiplier",
        name: "Incident Severity Multiplier",
        variableName: "incident_severity_multiplier",
        type: "real",
        defaultValue: "1",
      },
    ],
    metrics: [
      {
        id: "metric__successful_deployments",
        name: "Successful deployments",
        description:
          "Cumulative number of deployments that finished without causing an incident.",
        code: `return state.places.CompletedDeployments.count;`,
      },
      {
        id: "metric__failed_deployments",
        name: "Failed deployments",
        description:
          "Cumulative number of deployments that rolled back and opened an incident.",
        code: `return state.places.FailedDeployments.count;`,
      },
      {
        id: "metric__release_queue_length",
        name: "Release queue length",
        description: "How many deployments are waiting behind the safety gate.",
        code: `return state.places.DeploymentReady.count;`,
      },
      {
        id: "metric__active_incidents",
        name: "Active incidents",
        description:
          "Number of incidents currently blocking the deployment gate.",
        code: `return state.places.IncidentBeingInvestigated.count;`,
      },
      {
        id: "metric__deployment_gate_blocked",
        name: "Deployment gate blocked",
        description:
          "Returns 1 when an incident or active deployment is preventing another deployment from starting; otherwise 0.",
        code: `const incidents = state.places.IncidentBeingInvestigated.count;
const inProgress = state.places.DeploymentInProgress.count;
return incidents > 0 || inProgress > 0 ? 1 : 0;`,
      },
      {
        id: "metric__failure_share",
        name: "Failure share",
        description:
          "Share of completed-or-failed deployments that ended in failure.",
        code: `const failed = state.places.FailedDeployments.count;
const succeeded = state.places.CompletedDeployments.count;
const total = failed + succeeded;
return total === 0 ? 0 : failed / total;`,
      },
    ],
    scenarios: [
      {
        id: "scenario__baseline",
        name: "Baseline operations",
        description:
          "Balanced deployment rate, moderate risk, and normal incident flow. Good starting point for explaining the inhibitor gate.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "deployment_rate",
            default: 0.5,
          },
          {
            type: "real",
            identifier: "incident_rate",
            default: 0.1,
          },
          {
            type: "real",
            identifier: "risk_multiplier",
            default: 1,
          },
          {
            type: "real",
            identifier: "mean_size",
            default: 1,
          },
          {
            type: "real",
            identifier: "resolution_rate",
            default: 0.3,
          },
        ],
        parameterOverrides: {
          param__deployment_creation_rate: "scenario.deployment_rate",
          param__incident_rate: "scenario.incident_rate",
          param__deployment_risk_multiplier: "scenario.risk_multiplier",
          param__mean_deployment_size: "scenario.mean_size",
          param__incident_resolution_rate: "scenario.resolution_rate",
        },
        initialState: {
          type: "per_place",
          content: {},
        },
      },
      {
        id: "scenario__incident_surge",
        name: "Incident surge",
        description:
          "External incidents arrive quickly and block the deployment gate, causing the release queue to pile up.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "deployment_rate",
            default: 0.5,
          },
          {
            type: "real",
            identifier: "incident_rate",
            default: 0.35,
          },
          {
            type: "real",
            identifier: "severity_multiplier",
            default: 1.25,
          },
          {
            type: "real",
            identifier: "resolution_rate",
            default: 0.22,
          },
        ],
        parameterOverrides: {
          param__deployment_creation_rate: "scenario.deployment_rate",
          param__incident_rate: "scenario.incident_rate",
          param__incident_severity_multiplier: "scenario.severity_multiplier",
          param__incident_resolution_rate: "scenario.resolution_rate",
        },
        initialState: {
          type: "per_place",
          content: {},
        },
      },
      {
        id: "scenario__high_velocity",
        name: "High deployment velocity",
        description:
          "A high release creation rate tests whether the single-deployment safety gate becomes the bottleneck.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "deployment_rate",
            default: 1.2,
          },
          {
            type: "real",
            identifier: "finish_rate",
            default: 0.45,
          },
          {
            type: "real",
            identifier: "risk_multiplier",
            default: 1,
          },
          {
            type: "real",
            identifier: "incident_rate",
            default: 0.08,
          },
        ],
        parameterOverrides: {
          param__deployment_creation_rate: "scenario.deployment_rate",
          param__deployment_finish_base_rate: "scenario.finish_rate",
          param__deployment_risk_multiplier: "scenario.risk_multiplier",
          param__incident_rate: "scenario.incident_rate",
        },
        initialState: {
          type: "per_place",
          content: {},
        },
      },
      {
        id: "scenario__risky_large_releases",
        name: "Risky large releases",
        description:
          "Larger, riskier releases take longer and more often create incidents, visibly closing the inhibitor gate.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "deployment_rate",
            default: 0.45,
          },
          {
            type: "real",
            identifier: "mean_size",
            default: 1.8,
          },
          {
            type: "real",
            identifier: "risk_multiplier",
            default: 1.75,
          },
          {
            type: "real",
            identifier: "failure_base_rate",
            default: 0.07,
          },
          {
            type: "real",
            identifier: "severity_multiplier",
            default: 1.4,
          },
        ],
        parameterOverrides: {
          param__deployment_creation_rate: "scenario.deployment_rate",
          param__mean_deployment_size: "scenario.mean_size",
          param__deployment_risk_multiplier: "scenario.risk_multiplier",
          param__deployment_failure_base_rate: "scenario.failure_base_rate",
          param__incident_severity_multiplier: "scenario.severity_multiplier",
        },
        initialState: {
          type: "per_place",
          content: {},
        },
      },
    ],
  },
};
