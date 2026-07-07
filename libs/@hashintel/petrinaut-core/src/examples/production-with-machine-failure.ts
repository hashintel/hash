import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * Manufacturing line where machines produce goods, accumulate damage, break
 * down, and are repaired by travelling technicians.
 *
 * Demonstrates three typed places (Machine, Machine-Producing-Product, and
 * Technician) with continuous dynamics: production progress advances, damage
 * is repaired, and technicians travel toward the site. Production is a race
 * between a predicate "Production Success" (fires once `transformation_progress
 * >= 1`) and a stochastic "Machine Fail" whose rate is `machine_damage_ratio **
 * 100`, so failure becomes overwhelmingly likely only as damage approaches 1.
 * The "Default Production" scenario seeds configurable raw material, machine
 * count, and initial machine damage.
 *
 * See `docs/examples.md` (Production with Machine Failure) for the walkthrough.
 */
export const productionMachines: { title: string; petriNetDefinition: SDCPN } =
  {
    title: "Production With Machine Failure",
    petriNetDefinition: {
      places: [
        {
          id: "place__d662407f-c56d-4a96-bcbb-ead785a9c594",
          name: "RawMaterial",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          showAsInitialState: true,
          x: -11 * GRID_SIZE,
          y: -27 * GRID_SIZE,
        },
        {
          id: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
          name: "AvailableMachines",
          colorId: "type__1762560152725",
          dynamicsEnabled: false,
          differentialEquationId: null,
          showAsInitialState: true,
          x: -10 * GRID_SIZE,
          y: 5 * GRID_SIZE,
        },
        {
          id: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
          name: "MachinesProducing",
          colorId: "type__1762560154179",
          dynamicsEnabled: true,
          differentialEquationId: "ca26e5e2-0373-46a9-920e-a6eacadd92e8",
          x: 25 * GRID_SIZE,
          y: -15 * GRID_SIZE,
        },
        {
          id: "place__d5f92ae2-c8c4-49cb-935e-4a35e4f7b5fe",
          name: "BadProduct",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 74 * GRID_SIZE,
          y: -7 * GRID_SIZE,
        },
        {
          id: "place__7b695ff5-a397-4237-8e30-ddf8cbc9e2c4",
          name: "GoodProduct",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 74 * GRID_SIZE,
          y: -15 * GRID_SIZE,
        },
        {
          id: "place__e5af0410-d80a-4c8b-b3bf-692918b98e6c",
          name: "BrokenMachines",
          colorId: "type__1762560152725",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 74 * GRID_SIZE,
          y: 6 * GRID_SIZE,
        },
        {
          id: "place__17c65d6e-0c3e-48e6-a677-2914e28131ac",
          name: "MachinesBeingRepaired",
          colorId: "type__1762560152725",
          dynamicsEnabled: true,
          differentialEquationId: "5bfea547-faaf-4626-8662-6400d07c049e",
          x: -39 * GRID_SIZE,
          y: 27 * GRID_SIZE,
        },
        {
          id: "place__4b72cf19-907b-4fc0-ac0a-555453e95d4b",
          name: "TechniciansComing",
          colorId: "type__1762560159263",
          dynamicsEnabled: true,
          differentialEquationId: "887245c3-183c-4dac-a1aa-d602d21b6450",
          x: 57 * GRID_SIZE,
          y: 53 * GRID_SIZE,
        },
        {
          id: "place__eaca89b8-1db1-45fa-8c3a-6eb6f0419ffa",
          name: "AvailableTechnicians",
          colorId: "type__1762560159263",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 93 * GRID_SIZE,
          y: 53 * GRID_SIZE,
        },
        {
          id: "place__9cb073fb-f1d7-4613-8b10-8d1b08796f24",
          name: "MachinesToRepair",
          colorId: "type__1762560152725",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 74 * GRID_SIZE,
          y: 39 * GRID_SIZE,
        },
      ],
      transitions: [
        {
          id: "transition__76f23aa1-404a-4696-ac14-5a634af01221",
          name: "Production Success",
          inputArcs: [
            {
              placeId: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__7b695ff5-a397-4237-8e30-ddf8cbc9e2c4",
              weight: 1,
            },
            {
              placeId: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: `// Production finishes when the batch's transformation progress (advanced by
// the Production Dynamics) reaches 100%.
export default Lambda((tokens) => {
  return tokens.MachinesProducing[0].transformation_progress >= 1;
})`,
          transitionKernelCode: `// On success the machine returns to the AvailableMachines pool, carrying its
// accumulated damage with it. The GoodProduct output place is uncoloured, so
// it simply gains a token (no attributes to set here).
export default TransitionKernel((tokensByPlace) => {
  return {
    AvailableMachines: [
      { machine_damage_ratio: tokensByPlace.MachinesProducing[0].machine_damage_ratio }
    ],
  };
});`,
          x: 48 * GRID_SIZE,
          y: -15 * GRID_SIZE,
        },
        {
          id: "transition__b524484d-263e-4065-b8b2-7a8e49529260",
          name: "Machine Fail",
          inputArcs: [
            {
              placeId: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__d5f92ae2-c8c4-49cb-935e-4a35e4f7b5fe",
              weight: 1,
            },
            {
              placeId: "place__e5af0410-d80a-4c8b-b3bf-692918b98e6c",
              weight: 1,
            },
          ],
          lambdaType: "stochastic",
          lambdaCode: `// Failure competes with Production Success on the same producing machine.
// Raising the damage ratio (in [0,1]) to the 100th power keeps the hazard
// almost zero for healthy machines and only spikes as damage approaches 1,
// so machines mostly fail when they are already badly worn.
export default Lambda((tokens) => {
  return tokens.MachinesProducing[0].machine_damage_ratio ** 100;
})`,
          transitionKernelCode: `// A failed machine moves to BrokenMachines, keeping its damage ratio so the
// downstream repair flow knows how much damage to undo.
export default TransitionKernel((tokens) => {
  return {
    BrokenMachines: [
      {
        machine_damage_ratio: tokens.MachinesProducing[0].machine_damage_ratio
      }
    ],
  };
});`,
          x: 48 * GRID_SIZE,
          y: -7 * GRID_SIZE,
        },
        {
          id: "transition__c4b30ba4-da08-4407-b97b-41e2db5d6879",
          name: "Start Production",
          inputArcs: [
            {
              placeId: "place__d662407f-c56d-4a96-bcbb-ead785a9c594",
              weight: 1,
              type: "standard",
            },
            {
              placeId: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: `// Always enabled: production starts as soon as the input arcs are satisfied
// (one RawMaterial token and one AvailableMachine token).
export default Lambda(() => true)`,
          transitionKernelCode: `// Move the chosen machine into MachinesProducing with progress reset to 0,
// preserving whatever damage it has already accumulated.
export default TransitionKernel((tokensByPlace) => {
  return {
    MachinesProducing: [
      {
        machine_damage_ratio: tokensByPlace.AvailableMachines[0].machine_damage_ratio,
        transformation_progress: 0
      }
    ],
  };
});`,
          x: 6 * GRID_SIZE,
          y: -15 * GRID_SIZE,
        },
        {
          id: "transition__cc61df1f-00f3-456f-8a80-03e8b68f3007",
          name: "Finish Repair",
          inputArcs: [
            {
              placeId: "place__17c65d6e-0c3e-48e6-a677-2914e28131ac",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: `// Repair is complete once the Reparation Dynamics have driven the machine's
// damage ratio down to 0 (or below).
export default Lambda((tokens) => {
  return tokens.MachinesBeingRepaired[0].machine_damage_ratio <= 0;
})`,
          transitionKernelCode: `// Return the fully-repaired machine to the AvailableMachines pool with its
// damage reset to 0, ready to start producing again.
export default TransitionKernel((tokensByPlace, parameters) => {
  return {
    AvailableMachines: [
      { machine_damage_ratio: 0 }
    ],
  };
});`,
          x: -22 * GRID_SIZE,
          y: 27 * GRID_SIZE,
        },
        {
          id: "transition__11f0b21a-d0f2-4bd5-b4c1-d23627f921c5",
          name: "Call Technician",
          inputArcs: [
            {
              placeId: "place__e5af0410-d80a-4c8b-b3bf-692918b98e6c",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__4b72cf19-907b-4fc0-ac0a-555453e95d4b",
              weight: 1,
            },
            {
              placeId: "place__9cb073fb-f1d7-4613-8b10-8d1b08796f24",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: `// Always enabled: as soon as a machine is broken we dispatch a technician.
export default Lambda(() => true)`,
          transitionKernelCode: `// Park the broken machine in MachinesToRepair (passing the token straight
// through) and dispatch a technician who starts 10 units away; the Technician
// Travel Dynamics then count that distance down to 0.
export default TransitionKernel((tokens, parameters) => {
  return {
    MachinesToRepair: tokens.BrokenMachines,
    TechniciansComing: [
      { distance_to_site: 10 }
    ],
  };
});`,
          x: 38 * GRID_SIZE,
          y: 49 * GRID_SIZE,
        },
        {
          id: "transition__514730c0-7ac5-47d5-8def-91446a248a83",
          name: "Technician Ready",
          inputArcs: [
            {
              placeId: "place__4b72cf19-907b-4fc0-ac0a-555453e95d4b",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__eaca89b8-1db1-45fa-8c3a-6eb6f0419ffa",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: `// The technician has arrived once their remaining travel distance hits 0.
export default Lambda((tokens) => {
  return tokens.TechniciansComing[0].distance_to_site <= 0;
})`,
          transitionKernelCode: `// The arrived technician joins the AvailableTechnicians pool, ready to be
// paired with a machine in the Start Repair transition.
export default TransitionKernel((tokensByPlace, parameters) => {
  return {
    AvailableTechnicians: [
      { distance_to_site: 0 }
    ],
  };
});`,
          x: 75 * GRID_SIZE,
          y: 53 * GRID_SIZE,
        },
        {
          id: "transition__0efcd1bf-b1ff-466f-8a8f-c329ddce0ce8",
          name: "Start Repair",
          inputArcs: [
            {
              placeId: "place__eaca89b8-1db1-45fa-8c3a-6eb6f0419ffa",
              weight: 1,
              type: "standard",
            },
            {
              placeId: "place__9cb073fb-f1d7-4613-8b10-8d1b08796f24",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__17c65d6e-0c3e-48e6-a677-2914e28131ac",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: `// Always enabled: repair begins as soon as both input arcs are satisfied,
// i.e. an available technician AND a machine waiting to be repaired.
export default Lambda(() => true)`,
          transitionKernelCode: `// Pair the technician with the waiting machine: move it into
// MachinesBeingRepaired (carrying its current damage), where the Reparation
// Dynamics will steadily reduce the damage until Finish Repair fires.
export default TransitionKernel((tokens) => {
  return {
    MachinesBeingRepaired: [
      { machine_damage_ratio: tokens.MachinesToRepair[0].machine_damage_ratio }
    ],
  };
});`,
          x: 109 * GRID_SIZE,
          y: 32 * GRID_SIZE,
        },
      ],
      types: [
        {
          id: "type__1762560152725",
          name: "Machine",
          iconSlug: "circle",
          displayColor: "#3b82f6",
          elements: [
            {
              elementId: "element__1762560152725_3",
              name: "machine_damage_ratio",
              type: "real",
            },
          ],
        },
        {
          id: "type__1762560154179",
          name: "Machine Producing Product",
          iconSlug: "circle",
          displayColor: "#733bf6ff",
          elements: [
            {
              elementId: "element__1762560154179_2",
              name: "machine_damage_ratio",
              type: "real",
            },
            {
              elementId: "element__1762560154179_3",
              name: "transformation_progress",
              type: "real",
            },
          ],
        },
        {
          id: "type__1762560159263",
          name: "Technician",
          iconSlug: "circle",
          displayColor: "#3bf689ff",
          elements: [
            {
              elementId: "element__1762560159263_2",
              name: "distance_to_site",
              type: "real",
            },
          ],
        },
      ],
      differentialEquations: [
        {
          id: "5bfea547-faaf-4626-8662-6400d07c049e",
          name: "Reparation Dynamics",
          colorId: "type__1762560152725",
          code: `// Applies to machines in the MachinesBeingRepaired place. Dynamics return the
// DERIVATIVE of each attribute, so a negative value means the damage ratio
// falls steadily at the repair rate until Finish Repair fires at 0.
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ machine_damage_ratio }) => {
    return {
      machine_damage_ratio: -parameters.damage_reparation_per_second
    };
  });
});`,
        },
        {
          id: "ca26e5e2-0373-46a9-920e-a6eacadd92e8",
          name: "Production Dynamics",
          colorId: "type__1762560154179",
          code: `// Applies to machines actively producing (the MachinesProducing place).
// While producing, the machine accumulates damage at \`damage_per_second\` and
// its transformation_progress advances at 0.5/sec (so a batch takes ~2 sec to
// reach the progress >= 1 completion threshold). More time producing means
// more accumulated damage, which feeds the Machine Fail hazard.
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ machine_damage_ratio, transformation_progress }) => {
    return {
      machine_damage_ratio: parameters.damage_per_second,
      transformation_progress: 1 / 2
    };
  });
});`,
        },
        {
          id: "887245c3-183c-4dac-a1aa-d602d21b6450",
          name: "Technician Travel Dynamics",
          colorId: "type__1762560159263",
          code: `// Applies to technicians in the TechniciansComing place. They close the gap
// to the site at a constant 2 units/sec; once distance_to_site reaches 0 the
// Technician Ready transition can fire. (Dynamics return derivatives.)
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ distance_to_site }) => {
    return {
      distance_to_site: -2
    };
  });
});`,
        },
      ],
      parameters: [
        {
          id: "param__damage_per_second",
          name: "Damage Per Second",
          variableName: "damage_per_second",
          type: "real",
          defaultValue: "0.05",
        },
        {
          id: "param__damage_reparation_per_second",
          name: "Damage Reparation Per Second",
          variableName: "damage_reparation_per_second",
          type: "real",
          defaultValue: "0.333",
        },
      ],
      metrics: [
        {
          id: "metric__good_products",
          name: "Good products",
          description: "Cumulative count of products that passed and shipped.",
          code: `return state.places.GoodProduct.count;`,
        },
        {
          id: "metric__defective_products",
          name: "Defective products",
          description: "Cumulative count of products that came out defective.",
          code: `return state.places.BadProduct.count;`,
        },
        {
          id: "metric__yield",
          name: "Yield",
          description:
            "Share of finished products that were good rather than defective.",
          code: `const good = state.places.GoodProduct.count;
const bad = state.places.BadProduct.count;
const total = good + bad;
return total === 0 ? 1 : good / total;`,
        },
        {
          id: "metric__machines_down",
          name: "Machines down",
          description:
            "Machines that are broken, waiting for a technician, or being repaired (i.e. not producing).",
          code: `return (
  state.places.BrokenMachines.count +
  state.places.MachinesToRepair.count +
  state.places.MachinesBeingRepaired.count
);`,
        },
        {
          id: "metric__average_machine_damage",
          name: "Average machine damage",
          description:
            "Mean damage ratio across machines that are available or currently producing.",
          code: `const fleet = state.places.AvailableMachines.tokens.concat(
  state.places.MachinesProducing.tokens,
);
if (fleet.length === 0) return 0;
return fleet.reduce((sum, m) => sum + m.machine_damage_ratio, 0) / fleet.length;`,
        },
      ],
      scenarios: [
        {
          id: "scenario__default_production",
          name: "Default Production",
          description:
            "Configurable raw material, machine count, and initial machine damage.",
          scenarioParameters: [
            { type: "integer", identifier: "raw_material", default: 10 },
            { type: "integer", identifier: "machines_count", default: 3 },
            { type: "ratio", identifier: "initial_machine_damage", default: 0 },
          ],
          parameterOverrides: {},
          initialState: {
            type: "code",
            content: `return {
  RawMaterial: scenario.raw_material,
  AvailableMachines: Array.from(
    { length: scenario.machines_count },
    () => ({ machine_damage_ratio: scenario.initial_machine_damage }),
  ),
};`,
          },
        },
      ],
    },
  };
