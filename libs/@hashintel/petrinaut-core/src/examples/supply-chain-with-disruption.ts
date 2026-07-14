import type { SDCPN } from "../types/sdcpn";

/**
 * End-to-end supply chain spanning dual-sourced procurement, factory
 * production, and customer order fulfilment, with disruption and recovery
 * throughout. This is the most complex built-in example.
 *
 * Raw materials are ordered from a reliable/expensive Supplier A and a
 * low-cost/riskier Supplier B, each of which stochastically toggles between
 * Available and Down states. Inbound shipments (typed with `eta`, `risk_score`,
 * `source`, `cost`) count down via dynamics and are received or damaged. A
 * factory machine with `health`/`wear` converts materials into production
 * batches whose `quality` decays with wear; batches pass or fail QA. On the
 * demand side, customer orders age, convert to backorders, and are fulfilled
 * from stock or cancelled, with outbound shipments delivered or lost. Lead
 * times, processing times, and quality use `Distribution.Gaussian`; risk and
 * priority draws use `Distribution.Uniform`.
 *
 * Ships with five per-place SVG visualizers, nine metrics, and five scenarios
 * (balanced dual source, demand surge, supplier outage, low-cost sourcing,
 * resilience investment). Best explored via scenarios — see
 * `docs/examples.md` (Supply Chain with Disruption).
 */
export const supplyChainWithDisruption: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Supply Chain With Disruption",
  petriNetDefinition: {
    places: [
      {
        id: "place_supplier_a_available",
        name: "SupplierAAvailable",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 405,
        y: 150,
      },
      {
        id: "place_supplier_a_down",
        name: "SupplierADown",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 960,
        y: 90,
      },
      {
        id: "place_supplier_b_available",
        name: "SupplierBAvailable",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 405,
        y: 525,
      },
      {
        id: "place_supplier_b_down",
        name: "SupplierBDown",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 960,
        y: 585,
      },
      {
        id: "place_raw_materials",
        name: "RawMaterials",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 960,
        y: 285,
      },
      {
        id: "place_damaged_inbound",
        name: "DamagedInbound",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 960,
        y: 435,
      },
      {
        id: "place_finished_goods",
        name: "FinishedGoods",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 2085,
        y: 435,
      },
      {
        id: "place_scrap",
        name: "Scrap",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 2085,
        y: 285,
      },
      {
        id: "place_delivered",
        name: "Delivered",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 3765,
        y: 540,
      },
      {
        id: "place_lost",
        name: "Lost",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 3765,
        y: 390,
      },
      {
        id: "place_cancelled",
        name: "Cancelled",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 3195,
        y: 615,
      },
      {
        id: "place_inbound",
        name: "InboundShipments",
        colorId: "type_shipment",
        dynamicsEnabled: true,
        differentialEquationId: "dyn_shipment_eta",
        visualizerCode: `// Inbound lanes: each shipment is a truck whose horizontal position shows
// how close it is to arriving (right edge = ETA 0). Blue = Supplier A,
// purple = Supplier B (decoded from the token's \`source\` field).
export default Visualization(({ tokens, parameters }) => {
  const width = 520;
  const height = 170;
  const maxEta = Math.max(1, parameters.max_eta_visual || 10);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "8px" }}>
      <rect width={width} height={height} fill="#eff6ff" />
      <text x="18" y="26" fontSize="18" fontWeight="700" fill="#1e3a8a">Inbound lanes</text>
      <line x1="60" y1="82" x2="470" y2="82" stroke="#93c5fd" strokeWidth="8" strokeLinecap="round" />
      {tokens.slice(0, 18).map((t, i) => {
        const x = 60 + (1 - Math.min(maxEta, Math.max(0, t.eta)) / maxEta) * 410;
        const y = 58 + (i % 3) * 24;
        const color = t.source < 1.5 ? "#2563eb" : "#7c3aed";
        return (
          <g key={i}>
            <rect x={x - 11} y={y - 8} width="22" height="16" rx="3" fill={color} opacity={0.9} />
            <circle cx={x - 6} cy={y + 10} r="3" fill="#0f172a" />
            <circle cx={x + 7} cy={y + 10} r="3" fill="#0f172a" />
          </g>
        );
      })}
      <text x="18" y="152" fontSize="14" fill="#475569">{tokens.length} shipments moving toward dock</text>
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 405,
        y: 300,
      },
      {
        id: "place_wip",
        name: "WorkInProcess",
        colorId: "type_batch",
        dynamicsEnabled: true,
        differentialEquationId: "dyn_batch_processing",
        visualizerCode: `// Factory WIP: one card per in-process batch. The fill bar shows processing
// progress (toward completion) and the % label is current quality; the bar
// turns green when quality is above the minimum and red when it has decayed
// below it (i.e. the batch is heading for scrap).
export default Visualization(({ tokens, parameters }) => {
  const width = 520;
  const height = 170;
  const maxTime = Math.max(1, parameters.production_time_mean || 3);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "8px" }}>
      <rect width={width} height={height} fill="#f0fdf4" />
      <text x="18" y="26" fontSize="18" fontWeight="700" fill="#14532d">Factory WIP</text>
      {tokens.slice(0, 14).map((b, i) => {
        const progress = 1 - Math.min(maxTime, Math.max(0, b.processing_left)) / maxTime;
        const x = 24 + (i % 7) * 68;
        const y = 46 + Math.floor(i / 7) * 52;
        const fill = b.quality >= parameters.min_quality ? "#22c55e" : "#ef4444";
        return (
          <g key={i}>
            <rect x={x} y={y} width="52" height="34" rx="6" fill="#dcfce7" stroke="#166534" />
            <rect x={x} y={y + 25} width={52 * progress} height="9" rx="3" fill={fill} />
            <text x={x + 26} y={y + 20} textAnchor="middle" fontSize="12" fill="#14532d">{Math.round(b.quality * 100)}%</text>
          </g>
        );
      })}
      <text x="18" y="154" fontSize="14" fill="#166534">{tokens.length} batches being processed</text>
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 1515,
        y: 300,
      },
      {
        id: "place_orders",
        name: "OpenOrders",
        colorId: "type_order",
        dynamicsEnabled: true,
        differentialEquationId: "dyn_order_age",
        visualizerCode: `// Customer queue: one dot per open order. Red = past its promised lead time
// (late), orange = on-time VIP, pale orange = on-time standard. The bottom
// bar grows with the queue length.
export default Visualization(({ tokens, parameters }) => {
  const width = 520;
  const height = 170;
  const urgent = tokens.filter(o => o.age > o.promised_lead_time).length;
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "8px" }}>
      <rect width={width} height={height} fill="#fff7ed" />
      <text x="18" y="26" fontSize="18" fontWeight="700" fill="#9a3412">Customer queue</text>
      {tokens.slice(0, 40).map((o, i) => {
        const x = 24 + (i % 20) * 23;
        const y = 48 + Math.floor(i / 20) * 34;
        const late = o.age > o.promised_lead_time;
        const fill = late ? "#dc2626" : (o.priority > 0.5 ? "#f97316" : "#fdba74");
        return <circle key={i} cx={x} cy={y} r="8" fill={fill} stroke="#7c2d12" strokeWidth="1" />;
      })}
      <text x="18" y="134" fontSize="14" fill="#9a3412">{tokens.length} open orders · {urgent} late</text>
      <rect x="18" y="145" width={Math.min(480, tokens.length * 8)} height="10" rx="5" fill="#fb923c" />
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 2085,
        y: 585,
      },
      {
        id: "place_backorders",
        name: "Backorders",
        colorId: "type_order",
        dynamicsEnabled: true,
        differentialEquationId: "dyn_order_age",
        visualizerCode: `// Backorder heat: one bar per backorder, taller the longer it has waited.
// Dark red bars are VIP orders. Tall bars signal customers about to cancel.
export default Visualization(({ tokens, parameters }) => {
  const width = 520;
  const height = 150;
  const maxAge = tokens.reduce((m, o) => Math.max(m, o.age), 0);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "8px" }}>
      <rect width={width} height={height} fill="#fef2f2" />
      <text x="18" y="26" fontSize="18" fontWeight="700" fill="#991b1b">Backorder heat</text>
      {tokens.slice(0, 30).map((o, i) => {
        const h = Math.min(90, 12 + o.age * 6);
        const x = 22 + i * 16;
        return <rect key={i} x={x} y={124 - h} width="11" height={h} rx="3" fill={o.priority > 0.5 ? "#7f1d1d" : "#ef4444"} opacity="0.85" />;
      })}
      <text x="18" y="142" fontSize="14" fill="#991b1b">{tokens.length} waiting · oldest {maxAge.toFixed(1)} days</text>
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 2640,
        y: 585,
      },
      {
        id: "place_outbound",
        name: "OutboundShipments",
        colorId: "type_shipment",
        dynamicsEnabled: true,
        differentialEquationId: "dyn_shipment_eta",
        visualizerCode: `// Last-mile deliveries: outbound shipments (vans) move left-to-right as
// their ETA counts down to 0, at which point they are delivered (or lost).
export default Visualization(({ tokens, parameters }) => {
  const width = 520;
  const height = 150;
  const maxEta = Math.max(1, parameters.outbound_lead_time * 2 || 3);
  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} style={{ width: "100%", borderRadius: "8px" }}>
      <rect width={width} height={height} fill="#f8fafc" />
      <text x="18" y="26" fontSize="18" fontWeight="700" fill="#334155">Last-mile deliveries</text>
      <line x1="55" y1="82" x2="470" y2="82" stroke="#cbd5e1" strokeWidth="7" strokeLinecap="round" />
      {tokens.slice(0, 20).map((t, i) => {
        const x = 55 + (1 - Math.min(maxEta, Math.max(0, t.eta)) / maxEta) * 415;
        const y = 60 + (i % 2) * 30;
        return (
          <g key={i}>
            <rect x={x - 10} y={y - 7} width="20" height="14" rx="3" fill="#0f766e" />
            <path d={\`M \${x + 12} \${y} l 13 -8 v 16 z\`} fill="#14b8a6" />
          </g>
        );
      })}
      <text x="18" y="136" fontSize="14" fill="#475569">{tokens.length} customer shipments in transit</text>
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 3195,
        y: 420,
      },
      {
        id: "place_machine_up",
        name: "MachineUp",
        colorId: "type_machine",
        dynamicsEnabled: true,
        differentialEquationId: "dyn_machine_health",
        visualizerCode: `export default Visualization(({ tokens, parameters }) => {
  const m = tokens[0] || { health: 0, wear: 1 };
  const health = Math.max(0, Math.min(1, m.health));
  const wear = Math.max(0, Math.min(1, m.wear));
  return (
    <svg viewBox="0 0 360 130" style={{ width: "100%", borderRadius: "8px" }}>
      <rect width="360" height="130" fill="#f8fafc" />
      <text x="18" y="26" fontSize="17" fontWeight="700" fill="#334155">Machine condition</text>
      <rect x="26" y="48" width="260" height="22" rx="11" fill="#e2e8f0" />
      <rect x="26" y="48" width={260 * health} height="22" rx="11" fill={health > 0.5 ? "#22c55e" : "#f59e0b"} />
      <text x="300" y="65" fontSize="13" fill="#334155">health</text>
      <rect x="26" y="86" width="260" height="18" rx="9" fill="#e2e8f0" />
      <rect x="26" y="86" width={260 * wear} height="18" rx="9" fill="#64748b" />
      <text x="300" y="100" fontSize="13" fill="#334155">wear</text>
    </svg>
  );
});`,
        showAsInitialState: true,
        x: 960,
        y: 735,
      },
      {
        id: "place_machine_down",
        name: "MachineDown",
        colorId: "type_machine",
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 405,
        y: 705,
      },
    ],
    transitions: [
      {
        id: "trans_order_supplier_a",
        name: "Order from reliable supplier A",
        inputArcs: [
          {
            placeId: "place_supplier_a_available",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_supplier_a_available",
            weight: 1,
          },
          {
            placeId: "place_inbound",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Supplier A places orders at a constant configured rate (only while
// Supplier A is in the Available place, which gates this transition).
export default Lambda((input, parameters) => {
  return parameters.supplier_a_order_rate;
});`,
        transitionKernelCode: `// Create one inbound Shipment token from Supplier A.
export default TransitionKernel((input, parameters) => {
  // Lead time is sampled from a Gaussian whose spread scales with the mean
  // (a coefficient of variation), then clamped so the ETA is always positive.
  const mean = Math.max(0.1, parameters.supplier_a_lead_time);
  const sd = Math.max(0.01, mean * parameters.lead_time_cv);
  const eta = Distribution.Gaussian(mean, sd).map(v => Math.max(0.1, v));
  return {
    InboundShipments: [{
      eta,
      // risk_score in [0,1]; the multiplier makes A more or less reliable.
      risk_score: Distribution.Uniform(0, 1).map(v => Math.min(1, v * parameters.supplier_a_risk_multiplier)),
      source: 1, // 1 = Supplier A (used by the inbound visualizer for colour).
      cost: parameters.supplier_a_cost,
    }],
  };
});`,
        x: 120,
        y: 180,
      },
      {
        id: "trans_order_supplier_b",
        name: "Order from low-cost supplier B",
        inputArcs: [
          {
            placeId: "place_supplier_b_available",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_supplier_b_available",
            weight: 1,
          },
          {
            placeId: "place_inbound",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Low-cost Supplier B orders at its own rate while it is Available.
export default Lambda((input, parameters) => {
  return parameters.supplier_b_order_rate;
});`,
        transitionKernelCode: `// Same shipment-creation logic as Supplier A, but with B's lead time,
// risk multiplier, and cost — typically cheaper but slower and riskier.
export default TransitionKernel((input, parameters) => {
  const mean = Math.max(0.1, parameters.supplier_b_lead_time);
  const sd = Math.max(0.01, mean * parameters.lead_time_cv);
  const eta = Distribution.Gaussian(mean, sd).map(v => Math.max(0.1, v));
  return {
    InboundShipments: [{
      eta,
      risk_score: Distribution.Uniform(0, 1).map(v => Math.min(1, v * parameters.supplier_b_risk_multiplier)),
      source: 2, // 2 = Supplier B.
      cost: parameters.supplier_b_cost,
    }],
  };
});`,
        x: 120,
        y: 525,
      },
      {
        id: "trans_supplier_a_disrupts",
        name: "Supplier A disruption",
        inputArcs: [
          {
            placeId: "place_supplier_a_available",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_supplier_a_down",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Supplier A randomly becomes disrupted: this moves the Supplier A token
// from Available to Down, which then stops new Supplier A orders until it
// recovers. The rate is constant (a memoryless time-to-failure).
export default Lambda((input, parameters) => {
  return parameters.supplier_a_disruption_rate;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 675,
        y: 150,
      },
      {
        id: "trans_supplier_a_recovers",
        name: "Supplier A recovers",
        inputArcs: [
          {
            placeId: "place_supplier_a_down",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_supplier_a_available",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// A disrupted Supplier A recovers at this rate, returning to Available.
export default Lambda((input, parameters) => {
  return parameters.supplier_a_repair_rate;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 120,
        y: 90,
      },
      {
        id: "trans_supplier_b_disrupts",
        name: "Supplier B disruption",
        inputArcs: [
          {
            placeId: "place_supplier_b_available",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_supplier_b_down",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Supplier B disruption — same Available -> Down mechanism as Supplier A.
export default Lambda((input, parameters) => {
  return parameters.supplier_b_disruption_rate;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 675,
        y: 585,
      },
      {
        id: "trans_supplier_b_recovers",
        name: "Supplier B recovers",
        inputArcs: [
          {
            placeId: "place_supplier_b_down",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_supplier_b_available",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// A disrupted Supplier B recovers at this rate, returning to Available.
export default Lambda((input, parameters) => {
  return parameters.supplier_b_repair_rate;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 1245,
        y: 195,
      },
      {
        id: "trans_inbound_good",
        name: "Inbound shipment received",
        inputArcs: [
          {
            placeId: "place_inbound",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_raw_materials",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// An inbound shipment is received cleanly once it has arrived (eta counted
// down to 0) AND its risk score is below the damage threshold. Higher-risk
// shipments instead fire the competing "damaged" transition below.
export default Lambda((input, parameters) => {
  const shipment = input.InboundShipments[0];
  return shipment.eta <= 0 && shipment.risk_score < parameters.inbound_damage_threshold;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 675,
        y: 285,
      },
      {
        id: "trans_inbound_damaged",
        name: "Inbound shipment damaged",
        inputArcs: [
          {
            placeId: "place_inbound",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_damaged_inbound",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// The mutually-exclusive partner of "received": an arrived shipment whose
// risk score is at or above the threshold is scrapped as damaged inbound.
export default Lambda((input, parameters) => {
  const shipment = input.InboundShipments[0];
  return shipment.eta <= 0 && shipment.risk_score >= parameters.inbound_damage_threshold;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 675,
        y: 435,
      },
      {
        id: "trans_start_production",
        name: "Start production batch",
        inputArcs: [
          {
            placeId: "place_raw_materials",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place_machine_up",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_machine_up",
            weight: 1,
          },
          {
            placeId: "place_wip",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Production only starts when the machine is healthy enough; below the
// minimum-health threshold the rate is 0, so a worn machine effectively
// stalls the line until it is repaired or maintained.
export default Lambda((input, parameters) => {
  const machine = input.MachineUp[0];
  return machine.health >= parameters.min_machine_health ? parameters.production_rate : 0;
});`,
        transitionKernelCode: `// Consume raw material + the machine, and emit a new WorkInProcess batch
// while returning the (now slightly more worn) machine to MachineUp.
export default TransitionKernel((input, parameters) => {
  const machine = input.MachineUp[0];
  // Remaining processing time for the batch, sampled and floored at 0.25.
  const processing = Distribution.Gaussian(parameters.production_time_mean, parameters.production_time_sd).map(v => Math.max(0.25, v));
  // Each batch adds wear and removes a little health from the machine.
  const wear = Math.min(1, machine.wear + parameters.wear_per_pallet);
  const health = Math.max(0, machine.health - parameters.wear_per_pallet * 0.5);
  return {
    MachineUp: [{ health, wear }],
    WorkInProcess: [{
      processing_left: processing,
      // Starting quality degrades as the machine wears; clamped to [0, 1].
      quality: Distribution.Gaussian(0.96 - wear * parameters.wear_quality_penalty, 0.06).map(q => Math.max(0, Math.min(1, q))),
      source_mix: 0.5,
      cost: parameters.production_unit_cost + wear * parameters.wear_cost_penalty,
    }],
  };
});`,
        x: 1245,
        y: 300,
      },
      {
        id: "trans_finish_good_batch",
        name: "Batch passes quality",
        inputArcs: [
          {
            placeId: "place_wip",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_finished_goods",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// A batch becomes a finished good once processing is complete AND its
// (wear- and decay-affected) quality still meets the minimum standard.
export default Lambda((input, parameters) => {
  const batch = input.WorkInProcess[0];
  return batch.processing_left <= 0 && batch.quality >= parameters.min_quality;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 1800,
        y: 435,
      },
      {
        id: "trans_scrap_bad_batch",
        name: "Batch fails quality",
        inputArcs: [
          {
            placeId: "place_wip",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_scrap",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// The competing outcome to "passes quality": a finished batch below the
// minimum quality is sent to Scrap instead of FinishedGoods.
export default Lambda((input, parameters) => {
  const batch = input.WorkInProcess[0];
  return batch.processing_left <= 0 && batch.quality < parameters.min_quality;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 1800,
        y: 285,
      },
      {
        id: "trans_machine_breakdown_random",
        name: "Machine breakdown",
        inputArcs: [
          {
            placeId: "place_machine_up",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_machine_down",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Breakdown hazard rises with wear and with poor health: a worn or unhealthy
// machine fails far more often than the base rate. This is what makes
// preventive maintenance worthwhile.
export default Lambda((input, parameters) => {
  const machine = input.MachineUp[0];
  return parameters.machine_breakdown_rate * (1 + machine.wear * 3 + Math.max(0, 0.5 - machine.health));
});`,
        transitionKernelCode: `// Move the machine to the Down place, knocking off a chunk of health.
export default TransitionKernel((input) => {
  const machine = input.MachineUp[0];
  return { MachineDown: [{ health: Math.max(0, machine.health - 0.15), wear: machine.wear }] };
});`,
        x: 120,
        y: 720,
      },
      {
        id: "trans_machine_repair",
        name: "Repair machine",
        inputArcs: [
          {
            placeId: "place_machine_down",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_machine_up",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// A broken machine is repaired at a constant rate (mean time-to-repair).
export default Lambda((input, parameters) => {
  return parameters.machine_repair_rate;
});`,
        transitionKernelCode: `// Repair restores most health and removes most wear, returning the machine
// to the Up place — a large but incomplete reset compared with maintenance.
export default TransitionKernel((input) => {
  const machine = input.MachineDown[0];
  return { MachineUp: [{ health: Math.min(1, machine.health + 0.55), wear: Math.max(0, machine.wear * 0.45) }] };
});`,
        x: 675,
        y: 705,
      },
      {
        id: "trans_preventive_maintenance",
        name: "Preventive maintenance",
        inputArcs: [
          {
            placeId: "place_machine_up",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_machine_up",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Preventive maintenance happens on the running machine (Up -> Up). It is
// performed much more eagerly once wear passes 25%, and only occasionally
// otherwise, so the strategy is "service it before it breaks".
export default Lambda((input, parameters) => {
  const machine = input.MachineUp[0];
  return machine.wear > 0.25 ? parameters.maintenance_rate * (1 + machine.wear) : parameters.maintenance_rate * 0.2;
});`,
        transitionKernelCode: `// Maintenance boosts health and shaves off some wear without taking the
// machine offline — cheaper and less disruptive than a full repair.
export default TransitionKernel((input, parameters) => {
  const machine = input.MachineUp[0];
  return { MachineUp: [{ health: Math.min(1, machine.health + parameters.maintenance_health_boost), wear: Math.max(0, machine.wear * 0.65) }] };
});`,
        x: 1245,
        y: 765,
      },
      {
        id: "trans_customer_demand",
        name: "Customer demand arrives",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place_orders",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Customers arrive at a constant rate. This transition has no input arcs,
// so it acts as an external (Poisson) arrival source for new orders.
export default Lambda((input, parameters) => {
  return parameters.demand_rate;
});`,
        transitionKernelCode: `// Create one new open order, classified as VIP or standard.
export default TransitionKernel((input, parameters) => {
  // Draw ONE uniform sample and reuse it via .map() so that priority and the
  // promised lead time stay consistent (a VIP both has priority 1 AND the
  // shorter promise). Sampling twice could give contradictory results.
  const priorityDraw = Distribution.Uniform(0, 1);
  return {
    OpenOrders: [{
      age: 0,
      priority: priorityDraw.map(v => v < parameters.vip_fraction ? 1 : 0),
      promised_lead_time: priorityDraw.map(v => v < parameters.vip_fraction ? 1.5 : 3.5),
    }],
  };
});`,
        x: 1800,
        y: 585,
      },
      {
        id: "trans_fulfill_open_order",
        name: "Fulfill open order from stock",
        inputArcs: [
          {
            placeId: "place_orders",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place_finished_goods",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_outbound",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Fulfil an order directly from stock. This transition needs both an open
// order AND a finished good (two standard input arcs), so it only fires when
// inventory is available. VIP orders are served faster via a rate boost.
export default Lambda((input, parameters) => {
  const order = input.OpenOrders[0];
  const priorityBoost = order.priority > 0.5 ? 1.6 : 1;
  return parameters.fulfillment_rate * priorityBoost;
});`,
        transitionKernelCode: `// Turn the fulfilled order into an outbound shipment.
export default TransitionKernel((input, parameters) => {
  const order = input.OpenOrders[0];
  const eta = Distribution.Gaussian(parameters.outbound_lead_time, parameters.outbound_lead_time * 0.25).map(v => Math.max(0.05, v));
  return {
    OutboundShipments: [{
      eta,
      risk_score: Distribution.Uniform(0, 1),
      source: order.priority > 0.5 ? 9 : 8, // 8/9 mark standard/VIP from-stock shipments.
      cost: parameters.outbound_cost + (order.priority > 0.5 ? 3 : 0),
    }],
  };
});`,
        x: 2355,
        y: 450,
      },
      {
        id: "trans_convert_to_backorder",
        name: "Convert aging order to backorder",
        inputArcs: [
          {
            placeId: "place_orders",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place_finished_goods",
            weight: 1,
            type: "inhibitor",
          },
        ],
        outputArcs: [
          {
            placeId: "place_backorders",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// An aging order with no stock to fill it becomes a backorder. The inhibitor
// arc from FinishedGoods means this can ONLY fire when stock is empty, and we
// also wait until the order has exceeded its promised lead time (rate 0 until
// then). VIP orders are escalated to backorder sooner.
export default Lambda((input, parameters) => {
  const order = input.OpenOrders[0];
  if (order.age < order.promised_lead_time) return 0;
  return parameters.backorder_conversion_rate * (order.priority > 0.5 ? 1.8 : 1);
});`,
        transitionKernelCode: `// Carry the order's age, priority, and promise across to the Backorders place.
export default TransitionKernel((input) => {
  const order = input.OpenOrders[0];
  return { Backorders: [{ age: order.age, priority: order.priority, promised_lead_time: order.promised_lead_time }] };
});`,
        x: 2355,
        y: 585,
      },
      {
        id: "trans_fulfill_backorder",
        name: "Fulfill backorder",
        inputArcs: [
          {
            placeId: "place_backorders",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place_finished_goods",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_outbound",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Once stock is replenished, backorders are cleared (again favouring VIPs).
// Requires both a backorder and a finished good, so it competes with new
// open-order fulfilment for the same inventory.
export default Lambda((input, parameters) => {
  const order = input.Backorders[0];
  return parameters.backorder_fulfillment_rate * (order.priority > 0.5 ? 1.7 : 1);
});`,
        transitionKernelCode: `// Ship the backordered item. Late backorders cost more (the age surcharge),
// reflecting expediting and goodwill costs.
export default TransitionKernel((input, parameters) => {
  const order = input.Backorders[0];
  return {
    OutboundShipments: [{
      eta: Distribution.Gaussian(parameters.outbound_lead_time, parameters.outbound_lead_time * 0.35).map(v => Math.max(0.05, v)),
      risk_score: Distribution.Uniform(0, 1),
      source: order.priority > 0.5 ? 7 : 6, // 6/7 mark standard/VIP backorder shipments.
      cost: parameters.outbound_cost + 2 + order.age * 0.1,
    }],
  };
});`,
        x: 2925,
        y: 390,
      },
      {
        id: "trans_cancel_backorder",
        name: "Customer cancels backorder",
        inputArcs: [
          {
            placeId: "place_backorders",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_cancelled",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Waiting customers may give up. The cancellation hazard grows with the
// order's age, so long-unfilled backorders are increasingly likely to be
// lost. VIPs are modelled as slightly more patient (lower multiplier).
export default Lambda((input, parameters) => {
  const order = input.Backorders[0];
  const vipPatience = order.priority > 0.5 ? 0.6 : 1;
  return vipPatience * (parameters.cancel_base_rate + order.age * parameters.cancel_age_factor);
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 2925,
        y: 615,
      },
      {
        id: "trans_outbound_delivered",
        name: "Outbound delivered",
        inputArcs: [
          {
            placeId: "place_outbound",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_delivered",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// Last-mile delivery succeeds when the outbound shipment has arrived and its
// risk score is below the loss threshold — the demand-side mirror of the
// inbound received/damaged split.
export default Lambda((input, parameters) => {
  const shipment = input.OutboundShipments[0];
  return shipment.eta <= 0 && shipment.risk_score < parameters.outbound_loss_threshold;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 3480,
        y: 540,
      },
      {
        id: "trans_outbound_lost",
        name: "Outbound lost or damaged",
        inputArcs: [
          {
            placeId: "place_outbound",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_lost",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// The competing outcome to delivery: an arrived shipment at or above the
// loss threshold is lost in transit and never reaches the customer.
export default Lambda((input, parameters) => {
  const shipment = input.OutboundShipments[0];
  return shipment.eta <= 0 && shipment.risk_score >= parameters.outbound_loss_threshold;
});`,
        transitionKernelCode: `// This transition only routes/marks tokens — the destination place needs
// no computed attributes — so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 3480,
        y: 390,
      },
    ],
    types: [
      {
        id: "type_shipment",
        name: "Shipment",
        iconSlug: "truck",
        displayColor: "#2563eb",
        elements: [
          {
            elementId: "ship_eta",
            name: "eta",
            type: "real",
          },
          {
            elementId: "ship_risk",
            name: "risk_score",
            type: "real",
          },
          {
            elementId: "ship_source",
            name: "source",
            type: "integer",
          },
          {
            elementId: "ship_cost",
            name: "cost",
            type: "real",
          },
        ],
      },
      {
        id: "type_order",
        name: "Customer order",
        iconSlug: "clipboard",
        displayColor: "#f97316",
        elements: [
          {
            elementId: "order_age",
            name: "age",
            type: "real",
          },
          {
            elementId: "order_priority",
            name: "priority",
            type: "real",
          },
          {
            elementId: "order_promise",
            name: "promised_lead_time",
            type: "real",
          },
        ],
      },
      {
        id: "type_batch",
        name: "Production batch",
        iconSlug: "box",
        displayColor: "#16a34a",
        elements: [
          {
            elementId: "batch_processing_left",
            name: "processing_left",
            type: "real",
          },
          {
            elementId: "batch_quality",
            name: "quality",
            type: "real",
          },
          {
            elementId: "batch_source_mix",
            name: "source_mix",
            type: "real",
          },
          {
            elementId: "batch_cost",
            name: "cost",
            type: "real",
          },
        ],
      },
      {
        id: "type_machine",
        name: "Factory machine",
        iconSlug: "cog",
        displayColor: "#64748b",
        elements: [
          {
            elementId: "machine_health",
            name: "health",
            type: "real",
          },
          {
            elementId: "machine_wear",
            name: "wear",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "dyn_shipment_eta",
        name: "Shipment ETA countdown",
        colorId: "type_shipment",
        code: `// Counts each shipment's ETA down by 1 per simulated unit of time. Dynamics
// return DERIVATIVES, so eta: -1 means "decrease eta at rate 1"; once it
// reaches 0 the derivative becomes 0 (it holds, ready for arrival predicates).
// All other attributes are constant during transit (derivative 0).
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ eta }) => ({
    eta: eta > 0 ? -1 : 0,
    risk_score: 0,
    cost: 0,
  }));
});`,
      },
      {
        id: "dyn_order_age",
        name: "Order aging",
        colorId: "type_order",
        code: `// Every waiting order ages at a constant rate (age derivative = 1), driving
// the backorder-conversion and cancellation hazards that depend on age.
export default Dynamics((tokens, parameters) => {
  return tokens.map(() => ({
    age: 1,
    priority: 0,
    promised_lead_time: 0,
  }));
});`,
      },
      {
        id: "dyn_batch_processing",
        name: "Batch processing countdown",
        colorId: "type_batch",
        code: `// While a batch is in process, processing_left counts down toward 0 and its
// quality slowly decays. So a batch that sits in WIP too long can drift below
// the minimum quality and end up scrapped rather than finished.
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ processing_left, quality, source_mix, cost }) => ({
    processing_left: processing_left > 0 ? -parameters.production_progress_rate : 0,
    // Decay stops at 0 so quality stays within its implied [0, 1] range
    // (a batch is scrapped once it falls below the minimum quality anyway).
    quality: quality > 0 ? -parameters.quality_decay_rate : 0,
    source_mix: 0,
    cost: 0,
  }));
});`,
      },
      {
        id: "dyn_machine_health",
        name: "Machine health drift",
        colorId: "type_machine",
        code: `// The running machine continuously loses a little health and gains a little
// wear even between batches. Combined with the per-batch wear in production,
// this is the slow degradation that maintenance and repair counteract.
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ health, wear }) => ({
    health: health > 0 ? -parameters.machine_health_decay : 0,
    // Wear accrues only up to 1 so it stays within its implied [0, 1] range.
    wear: wear < 1 ? parameters.machine_wear_rate : 0,
  }));
});`,
      },
    ],
    parameters: [
      {
        id: "param_demand_rate",
        name: "Customer Demand Rate",
        variableName: "demand_rate",
        type: "real",
        defaultValue: "0.55",
      },
      {
        id: "param_vip_fraction",
        name: "VIP Order Fraction",
        variableName: "vip_fraction",
        type: "real",
        defaultValue: "0.12",
      },
      {
        id: "param_supplier_a_order_rate",
        name: "Supplier A Order Rate",
        variableName: "supplier_a_order_rate",
        type: "real",
        defaultValue: "0.42",
      },
      {
        id: "param_supplier_b_order_rate",
        name: "Supplier B Order Rate",
        variableName: "supplier_b_order_rate",
        type: "real",
        defaultValue: "0.28",
      },
      {
        id: "param_supplier_a_lead_time",
        name: "Supplier A Mean Lead Time",
        variableName: "supplier_a_lead_time",
        type: "real",
        defaultValue: "4",
      },
      {
        id: "param_supplier_b_lead_time",
        name: "Supplier B Mean Lead Time",
        variableName: "supplier_b_lead_time",
        type: "real",
        defaultValue: "7",
      },
      {
        id: "param_lead_time_cv",
        name: "Inbound Lead Time CV",
        variableName: "lead_time_cv",
        type: "real",
        defaultValue: "0.35",
      },
      {
        id: "param_supplier_a_disruption_rate",
        name: "Supplier A Disruption Rate",
        variableName: "supplier_a_disruption_rate",
        type: "real",
        defaultValue: "0.025",
      },
      {
        id: "param_supplier_a_repair_rate",
        name: "Supplier A Recovery Rate",
        variableName: "supplier_a_repair_rate",
        type: "real",
        defaultValue: "0.18",
      },
      {
        id: "param_supplier_b_disruption_rate",
        name: "Supplier B Disruption Rate",
        variableName: "supplier_b_disruption_rate",
        type: "real",
        defaultValue: "0.015",
      },
      {
        id: "param_supplier_b_repair_rate",
        name: "Supplier B Recovery Rate",
        variableName: "supplier_b_repair_rate",
        type: "real",
        defaultValue: "0.14",
      },
      {
        id: "param_supplier_a_cost",
        name: "Supplier A Unit Cost",
        variableName: "supplier_a_cost",
        type: "real",
        defaultValue: "16",
      },
      {
        id: "param_supplier_b_cost",
        name: "Supplier B Unit Cost",
        variableName: "supplier_b_cost",
        type: "real",
        defaultValue: "12",
      },
      {
        id: "param_supplier_a_risk_multiplier",
        name: "Supplier A Risk Multiplier",
        variableName: "supplier_a_risk_multiplier",
        type: "real",
        defaultValue: "0.75",
      },
      {
        id: "param_supplier_b_risk_multiplier",
        name: "Supplier B Risk Multiplier",
        variableName: "supplier_b_risk_multiplier",
        type: "real",
        defaultValue: "1.15",
      },
      {
        id: "param_inbound_damage_threshold",
        name: "Inbound Damage Threshold",
        variableName: "inbound_damage_threshold",
        type: "real",
        defaultValue: "0.88",
      },
      {
        id: "param_production_rate",
        name: "Production Start Rate",
        variableName: "production_rate",
        type: "real",
        defaultValue: "0.9",
      },
      {
        id: "param_production_time_mean",
        name: "Mean Production Time",
        variableName: "production_time_mean",
        type: "real",
        defaultValue: "2.5",
      },
      {
        id: "param_production_time_sd",
        name: "Production Time Std Dev",
        variableName: "production_time_sd",
        type: "real",
        defaultValue: "0.65",
      },
      {
        id: "param_production_progress_rate",
        name: "Production Progress Rate",
        variableName: "production_progress_rate",
        type: "real",
        defaultValue: "1",
      },
      {
        id: "param_quality_decay_rate",
        name: "WIP Quality Decay Rate",
        variableName: "quality_decay_rate",
        type: "real",
        defaultValue: "0.01",
      },
      {
        id: "param_min_quality",
        name: "Minimum Acceptable Quality",
        variableName: "min_quality",
        type: "real",
        defaultValue: "0.72",
      },
      {
        id: "param_production_unit_cost",
        name: "Production Unit Cost",
        variableName: "production_unit_cost",
        type: "real",
        defaultValue: "8",
      },
      {
        id: "param_wear_quality_penalty",
        name: "Wear Quality Penalty",
        variableName: "wear_quality_penalty",
        type: "real",
        defaultValue: "0.18",
      },
      {
        id: "param_wear_per_pallet",
        name: "Wear Per Pallet",
        variableName: "wear_per_pallet",
        type: "real",
        defaultValue: "0.012",
      },
      {
        id: "param_wear_cost_penalty",
        name: "Wear Cost Penalty",
        variableName: "wear_cost_penalty",
        type: "real",
        defaultValue: "4",
      },
      {
        id: "param_min_machine_health",
        name: "Minimum Machine Health",
        variableName: "min_machine_health",
        type: "real",
        defaultValue: "0.18",
      },
      {
        id: "param_machine_breakdown_rate",
        name: "Machine Breakdown Rate",
        variableName: "machine_breakdown_rate",
        type: "real",
        defaultValue: "0.012",
      },
      {
        id: "param_machine_repair_rate",
        name: "Machine Repair Rate",
        variableName: "machine_repair_rate",
        type: "real",
        defaultValue: "0.22",
      },
      {
        id: "param_machine_health_decay",
        name: "Machine Health Decay",
        variableName: "machine_health_decay",
        type: "real",
        defaultValue: "0.006",
      },
      {
        id: "param_machine_wear_rate",
        name: "Machine Wear Drift",
        variableName: "machine_wear_rate",
        type: "real",
        defaultValue: "0.002",
      },
      {
        id: "param_fulfillment_rate",
        name: "Same-Day Fulfillment Rate",
        variableName: "fulfillment_rate",
        type: "real",
        defaultValue: "1.4",
      },
      {
        id: "param_backorder_conversion_rate",
        name: "Backorder Conversion Rate",
        variableName: "backorder_conversion_rate",
        type: "real",
        defaultValue: "1.0",
      },
      {
        id: "param_backorder_fulfillment_rate",
        name: "Backorder Fulfillment Rate",
        variableName: "backorder_fulfillment_rate",
        type: "real",
        defaultValue: "0.75",
      },
      {
        id: "param_cancel_base_rate",
        name: "Base Cancellation Rate",
        variableName: "cancel_base_rate",
        type: "real",
        defaultValue: "0.015",
      },
      {
        id: "param_cancel_age_factor",
        name: "Cancellation Age Factor",
        variableName: "cancel_age_factor",
        type: "real",
        defaultValue: "0.006",
      },
      {
        id: "param_outbound_lead_time",
        name: "Outbound Mean Lead Time",
        variableName: "outbound_lead_time",
        type: "real",
        defaultValue: "1.2",
      },
      {
        id: "param_outbound_loss_threshold",
        name: "Outbound Loss Threshold",
        variableName: "outbound_loss_threshold",
        type: "real",
        defaultValue: "0.96",
      },
      {
        id: "param_outbound_cost",
        name: "Outbound Shipment Cost",
        variableName: "outbound_cost",
        type: "real",
        defaultValue: "5",
      },
      {
        id: "param_max_eta_visual",
        name: "Visualizer Max ETA",
        variableName: "max_eta_visual",
        type: "real",
        defaultValue: "10",
      },
      {
        id: "param_maintenance_rate",
        name: "Preventive Maintenance Rate",
        variableName: "maintenance_rate",
        type: "real",
        defaultValue: "0.05",
      },
      {
        id: "param_maintenance_health_boost",
        name: "Maintenance Health Boost",
        variableName: "maintenance_health_boost",
        type: "real",
        defaultValue: "0.28",
      },
      {
        id: "param_initial_raw_materials",
        name: "Initial Raw Materials",
        variableName: "initial_raw_materials",
        type: "integer",
        defaultValue: "8",
      },
      {
        id: "param_initial_finished_goods",
        name: "Initial Finished Goods",
        variableName: "initial_finished_goods",
        type: "integer",
        defaultValue: "12",
      },
    ],
    metrics: [
      {
        id: "metric_service_level",
        name: "Service level",
        description:
          "Fraction of completed demand outcomes that reached the customer instead of being lost or cancelled.",
        code: `// Of all orders that reached a terminal outcome, the share that were
// delivered (vs. lost in transit or cancelled while waiting). Returns 1
// before any outcome exists to avoid dividing by zero.
const delivered = state.places.Delivered.count;
const failed = state.places.Lost.count + state.places.Cancelled.count;
const total = delivered + failed;
return total === 0 ? 1 : delivered / total;`,
      },
      {
        id: "metric_customer_pressure",
        name: "Customer pressure",
        description:
          "Total orders currently waiting either as open orders or backorders.",
        code: `return state.places.OpenOrders.count + state.places.Backorders.count;`,
      },
      {
        id: "metric_stock_position",
        name: "Stock position",
        description: "Finished goods inventory minus customer backorders.",
        code: `return state.places.FinishedGoods.count - state.places.Backorders.count;`,
      },
      {
        id: "metric_inbound_pipeline",
        name: "Inbound pipeline",
        description:
          "Number of raw-material shipments currently in transit from both suppliers.",
        code: `return state.places.InboundShipments.count;`,
      },
      {
        id: "metric_average_inbound_risk",
        name: "Average inbound risk",
        description:
          "Mean risk score of shipments currently in the inbound pipeline.",
        code: `const shipments = state.places.InboundShipments.tokens;
if (shipments.length === 0) return 0;
return shipments.reduce((sum, s) => sum + s.risk_score, 0) / shipments.length;`,
      },
      {
        id: "metric_factory_available",
        name: "Factory available",
        description: "1 when the production machine is up, 0 when it is down.",
        code: `return state.places.MachineUp.count > 0 ? 1 : 0;`,
      },
      {
        id: "metric_scrap_rate",
        name: "Scrap fraction",
        description:
          "Share of completed production batches that failed quality inspection.",
        code: `// Scrapped batches as a share of all completed batches. "Good" counts every
// batch that passed quality, wherever it ended up downstream (in stock, in
// transit, delivered, or even lost) — so this measures production quality,
// not delivery success.
const scrap = state.places.Scrap.count;
const good = state.places.FinishedGoods.count + state.places.OutboundShipments.count + state.places.Delivered.count + state.places.Lost.count;
const total = scrap + good;
return total === 0 ? 0 : scrap / total;`,
      },
      {
        id: "metric_supplier_outages",
        name: "Suppliers down",
        description: "How many of the two suppliers are currently disrupted.",
        code: `return state.places.SupplierADown.count + state.places.SupplierBDown.count;`,
      },
      {
        id: "metric_average_order_age",
        name: "Average waiting order age",
        description: "Average age in days of all unfulfilled customer orders.",
        code: `const orders = state.places.OpenOrders.tokens.concat(state.places.Backorders.tokens);
if (orders.length === 0) return 0;
return orders.reduce((sum, o) => sum + o.age, 0) / orders.length;`,
      },
    ],
    scenarios: [
      {
        id: "scenario_balanced_dual_source",
        name: "Balanced dual source",
        description:
          "Baseline: moderate demand, split sourcing between reliable Supplier A and lower-cost Supplier B, normal factory reliability.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "demand_multiplier",
            default: 1,
          },
          {
            type: "ratio",
            identifier: "a_share_bias",
            default: 1,
          },
          {
            type: "integer",
            identifier: "initial_raw_materials",
            default: 8,
          },
          {
            type: "integer",
            identifier: "initial_finished_goods",
            default: 12,
          },
        ],
        parameterOverrides: {
          param_demand_rate:
            "parameters.demand_rate * scenario.demand_multiplier",
          param_supplier_a_order_rate:
            "parameters.supplier_a_order_rate * scenario.a_share_bias",
          param_supplier_b_order_rate:
            "parameters.supplier_b_order_rate * (2 - scenario.a_share_bias)",
          param_initial_raw_materials: "scenario.initial_raw_materials",
          param_initial_finished_goods: "scenario.initial_finished_goods",
        },
        initialState: {
          type: "per_place",
          content: {
            place_supplier_a_available: "1",
            place_supplier_a_down: "0",
            place_supplier_b_available: "1",
            place_supplier_b_down: "0",
            place_raw_materials: "scenario.initial_raw_materials",
            place_finished_goods: "scenario.initial_finished_goods",
            place_damaged_inbound: "0",
            place_scrap: "0",
            place_delivered: "0",
            place_lost: "0",
            place_cancelled: "0",
            place_machine_up: [[0.95, 0.08]],
            place_machine_down: [],
            place_inbound: [],
            place_wip: [],
            place_orders: [],
            place_backorders: [],
            place_outbound: [],
          },
        },
      },
      {
        id: "scenario_demand_surge_port_congestion",
        name: "Demand surge and port congestion",
        description:
          "High demand coincides with slower, riskier inbound logistics. Useful for exploring backlog and service-level collapse.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "demand_multiplier",
            default: 1.8,
          },
          {
            type: "real",
            identifier: "lead_time_multiplier",
            default: 1.7,
          },
          {
            type: "real",
            identifier: "damage_threshold",
            default: 0.78,
          },
          {
            type: "integer",
            identifier: "initial_finished_goods",
            default: 18,
          },
        ],
        parameterOverrides: {
          param_demand_rate:
            "parameters.demand_rate * scenario.demand_multiplier",
          param_supplier_a_lead_time:
            "parameters.supplier_a_lead_time * scenario.lead_time_multiplier",
          param_supplier_b_lead_time:
            "parameters.supplier_b_lead_time * scenario.lead_time_multiplier",
          param_inbound_damage_threshold: "scenario.damage_threshold",
          param_initial_finished_goods: "scenario.initial_finished_goods",
        },
        initialState: {
          type: "per_place",
          content: {
            place_supplier_a_available: "1",
            place_supplier_a_down: "0",
            place_supplier_b_available: "1",
            place_supplier_b_down: "0",
            place_raw_materials: "6",
            place_finished_goods: "scenario.initial_finished_goods",
            place_damaged_inbound: "0",
            place_scrap: "0",
            place_delivered: "0",
            place_lost: "0",
            place_cancelled: "0",
            place_machine_up: [[0.9, 0.12]],
            place_machine_down: [],
            place_inbound: [],
            place_wip: [],
            place_orders: [],
            place_backorders: [],
            place_outbound: [],
          },
        },
      },
      {
        id: "scenario_supplier_a_outage",
        name: "Reliable supplier outage",
        description:
          "Supplier A starts disrupted, forcing the network toward cheaper but slower Supplier B until A recovers.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "a_recovery_rate",
            default: 0.08,
          },
          {
            type: "real",
            identifier: "b_expedite_multiplier",
            default: 1.6,
          },
          {
            type: "integer",
            identifier: "initial_finished_goods",
            default: 10,
          },
        ],
        parameterOverrides: {
          param_supplier_a_repair_rate: "scenario.a_recovery_rate",
          param_supplier_b_order_rate:
            "parameters.supplier_b_order_rate * scenario.b_expedite_multiplier",
          param_initial_finished_goods: "scenario.initial_finished_goods",
        },
        initialState: {
          type: "per_place",
          content: {
            place_supplier_a_available: "0",
            place_supplier_a_down: "1",
            place_supplier_b_available: "1",
            place_supplier_b_down: "0",
            place_raw_materials: "8",
            place_finished_goods: "scenario.initial_finished_goods",
            place_damaged_inbound: "0",
            place_scrap: "0",
            place_delivered: "0",
            place_lost: "0",
            place_cancelled: "0",
            place_machine_up: [[0.94, 0.1]],
            place_machine_down: [],
            place_inbound: [],
            place_wip: [],
            place_orders: [],
            place_backorders: [],
            place_outbound: [],
          },
        },
      },
      {
        id: "scenario_low_cost_sourcing",
        name: "Low-cost sourcing strategy",
        description:
          "Procurement leans into Supplier B. Costs fall conceptually, but longer lead times and higher risk stress service performance.",
        scenarioParameters: [
          {
            type: "real",
            identifier: "a_order_multiplier",
            default: 0.35,
          },
          {
            type: "real",
            identifier: "b_order_multiplier",
            default: 1.9,
          },
          {
            type: "real",
            identifier: "b_risk_multiplier",
            default: 1.45,
          },
          {
            type: "integer",
            identifier: "initial_raw_materials",
            default: 12,
          },
        ],
        parameterOverrides: {
          param_supplier_a_order_rate:
            "parameters.supplier_a_order_rate * scenario.a_order_multiplier",
          param_supplier_b_order_rate:
            "parameters.supplier_b_order_rate * scenario.b_order_multiplier",
          param_supplier_b_risk_multiplier: "scenario.b_risk_multiplier",
          param_initial_raw_materials: "scenario.initial_raw_materials",
        },
        initialState: {
          type: "per_place",
          content: {
            place_supplier_a_available: "1",
            place_supplier_a_down: "0",
            place_supplier_b_available: "1",
            place_supplier_b_down: "0",
            place_raw_materials: "scenario.initial_raw_materials",
            place_finished_goods: "8",
            place_damaged_inbound: "0",
            place_scrap: "0",
            place_delivered: "0",
            place_lost: "0",
            place_cancelled: "0",
            place_machine_up: [[0.96, 0.06]],
            place_machine_down: [],
            place_inbound: [],
            place_wip: [],
            place_orders: [],
            place_backorders: [],
            place_outbound: [],
          },
        },
      },
      {
        id: "scenario_resilience_investment",
        name: "Resilience investment",
        description:
          "Higher safety stock, more preventive maintenance, and faster repair/recovery rates reduce tail-risk events at the cost of extra buffer.",
        scenarioParameters: [
          {
            type: "integer",
            identifier: "initial_raw_materials",
            default: 18,
          },
          {
            type: "integer",
            identifier: "initial_finished_goods",
            default: 24,
          },
          {
            type: "real",
            identifier: "maintenance_multiplier",
            default: 2.2,
          },
          {
            type: "real",
            identifier: "supplier_recovery_multiplier",
            default: 1.8,
          },
        ],
        parameterOverrides: {
          param_maintenance_rate:
            "parameters.maintenance_rate * scenario.maintenance_multiplier",
          param_supplier_a_repair_rate:
            "parameters.supplier_a_repair_rate * scenario.supplier_recovery_multiplier",
          param_supplier_b_repair_rate:
            "parameters.supplier_b_repair_rate * scenario.supplier_recovery_multiplier",
          param_initial_raw_materials: "scenario.initial_raw_materials",
          param_initial_finished_goods: "scenario.initial_finished_goods",
        },
        initialState: {
          type: "per_place",
          content: {
            place_supplier_a_available: "1",
            place_supplier_a_down: "0",
            place_supplier_b_available: "1",
            place_supplier_b_down: "0",
            place_raw_materials: "scenario.initial_raw_materials",
            place_finished_goods: "scenario.initial_finished_goods",
            place_damaged_inbound: "0",
            place_scrap: "0",
            place_delivered: "0",
            place_lost: "0",
            place_cancelled: "0",
            place_machine_up: [[1, 0.03]],
            place_machine_down: [],
            place_inbound: [],
            place_wip: [],
            place_orders: [],
            place_backorders: [],
            place_outbound: [],
          },
        },
      },
    ],
  },
};
