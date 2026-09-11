import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * Vaccination campaign — an SIR wave with two policy levers and a cost account,
 * built as the model to optimize.
 *
 * Susceptible, Infected, Recovered and Vaccinated are plain counts. Infection
 * (`S + I -> 2I`) fires at `infection_rate` scaled down by the two levers:
 * `contact_reduction` (distancing) and `vaccine_efficacy × vaccination_coverage`
 * (the share of contacts that land on a protected person). Recovery moves
 * Infected to Recovered at `recovery_rate`. The wave persists for the whole
 * horizon while the scaled infection rate exceeds the recovery rate and dies
 * out below it, so the case count bends sharply around that threshold.
 *
 * The Winter wave scenario seeds `Vaccinated` from `vaccination_coverage` and
 * exposes both levers as scenario parameters. The Total cost metric charges
 * every case at `case_cost` and each lever at a price quadratic in its
 * intensity (`campaign_cost` and `distancing_cost`, per head at full
 * intensity), so both levers have diminishing returns against a rising price
 * and the minimum lies inside the domain rather than on a bound: a shallow
 * valley along the epidemic threshold with its floor near a coverage of 0.45
 * and a contact reduction of 0.4 for the default costs, at about 960 against
 * 1,280–2,220 in the corners over a 60-day horizon.
 *
 * GPU-ready as shipped: uncoloured places, rates that read only parameters,
 * and place counts as the experiment observables.
 */
export const vaccinationCampaign: { title: string; petriNetDefinition: SDCPN } =
  {
    title: "Vaccination Campaign",
    petriNetDefinition: {
      places: [
        {
          id: "place__susceptible",
          name: "Susceptible",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          showAsInitialState: true,
          x: -29 * GRID_SIZE,
          y: 10 * GRID_SIZE,
        },
        {
          id: "place__infected",
          name: "Infected",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          showAsInitialState: true,
          x: -13 * GRID_SIZE,
          y: 19 * GRID_SIZE,
        },
        {
          id: "place__recovered",
          name: "Recovered",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 25 * GRID_SIZE,
          y: 13 * GRID_SIZE,
        },
        {
          id: "place__vaccinated",
          name: "Vaccinated",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          showAsInitialState: true,
          x: -29 * GRID_SIZE,
          y: -4 * GRID_SIZE,
        },
      ],
      transitions: [
        {
          id: "transition__infection",
          name: "Infection",
          inputArcs: [
            {
              placeId: "place__susceptible",
              weight: 1,
              type: "standard",
            },
            {
              placeId: "place__infected",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__infected",
              weight: 2,
            },
          ],
          lambdaType: "stochastic",
          lambdaCode: `// Infectious contacts per day, cut by distancing and by the share of
// contacts that land on a protected (vaccinated and immune) person.
const distancing = 1 - parameters.contact_reduction;
const protection = 1 - parameters.vaccine_efficacy * parameters.vaccination_coverage;
return parameters.infection_rate * distancing * protection;`,
          transitionKernelCode: `// Consumes 1 Susceptible + 1 Infected and produces 2 Infected (the output
// arc has weight 2): the susceptible has become newly infected.
return {
  Infected: [{}, {}],
};`,
          x: -10 * GRID_SIZE,
          y: 5 * GRID_SIZE,
        },
        {
          id: "transition__recovery",
          name: "Recovery",
          inputArcs: [
            {
              placeId: "place__infected",
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [
            {
              placeId: "place__recovered",
              weight: 1,
            },
          ],
          lambdaType: "stochastic",
          lambdaCode: `// Recoveries per day. The wave dies out once the scaled infection rate
// falls below this rate, and persists for the whole horizon above it.
return parameters.recovery_rate;`,
          transitionKernelCode: `// Move one Infected to Recovered (1-to-1).
return {
  Recovered: [{}],
};`,
          x: 6 * GRID_SIZE,
          y: 16 * GRID_SIZE,
        },
      ],
      types: [],
      differentialEquations: [],
      parameters: [
        {
          id: "param__infection_rate",
          name: "Infection Rate",
          variableName: "infection_rate",
          type: "real",
          defaultValue: "3",
        },
        {
          id: "param__recovery_rate",
          name: "Recovery Rate",
          variableName: "recovery_rate",
          type: "real",
          defaultValue: "2",
        },
        {
          id: "param__vaccine_efficacy",
          name: "Vaccine Efficacy",
          variableName: "vaccine_efficacy",
          type: "real",
          defaultValue: "0.9",
        },
        {
          id: "param__vaccination_coverage",
          name: "Vaccination Coverage",
          variableName: "vaccination_coverage",
          type: "real",
          defaultValue: "0",
        },
        {
          id: "param__contact_reduction",
          name: "Contact Reduction",
          variableName: "contact_reduction",
          type: "real",
          defaultValue: "0",
        },
        {
          id: "param__case_cost",
          name: "Cost per Case",
          variableName: "case_cost",
          type: "real",
          defaultValue: "10",
        },
        {
          id: "param__campaign_cost",
          name: "Campaign Cost per Head at Full Coverage",
          variableName: "campaign_cost",
          type: "real",
          defaultValue: "1.2",
        },
        {
          id: "param__distancing_cost",
          name: "Distancing Cost per Head at Full Reduction",
          variableName: "distancing_cost",
          type: "real",
          defaultValue: "1.6",
        },
      ],
      scenarios: [
        {
          id: "scenario__winter_wave",
          name: "Winter wave",
          description:
            "A town of 1,000 seeded with 20 cases. Vaccination coverage is set before the wave and contact reduction holds for its whole run; optimize both against Total cost to find the cheapest mix.",
          scenarioParameters: [
            { type: "integer", identifier: "population", default: 1000 },
            { type: "integer", identifier: "initial_infected", default: 20 },
            { type: "ratio", identifier: "vaccination_coverage", default: 0.3 },
            { type: "ratio", identifier: "contact_reduction", default: 0.2 },
          ],
          parameterOverrides: {
            param__vaccination_coverage: "scenario.vaccination_coverage",
            param__contact_reduction: "scenario.contact_reduction",
          },
          initialState: {
            type: "per_place",
            content: {
              place__susceptible:
                "scenario.population - scenario.initial_infected - Math.round((scenario.population - scenario.initial_infected) * scenario.vaccination_coverage)",
              place__infected: "scenario.initial_infected",
              place__recovered: "0",
              place__vaccinated:
                "Math.round((scenario.population - scenario.initial_infected) * scenario.vaccination_coverage)",
            },
          },
        },
      ],
      metrics: [
        {
          id: "metric__total_cost",
          name: "Total cost",
          description:
            "Cases, the vaccination campaign and distancing priced together: the objective to minimize on the final state.",
          code: `const cases = state.places.Infected.count + state.places.Recovered.count;
const population =
  state.places.Susceptible.count + state.places.Vaccinated.count + cases;
const coverage = parameters.vaccination_coverage;
const reduction = parameters.contact_reduction;
return (
  cases * parameters.case_cost +
  coverage * coverage * parameters.campaign_cost * population +
  reduction * reduction * parameters.distancing_cost * population
);`,
        },
        {
          id: "metric__infected",
          name: "Infected",
          description:
            "People currently infected: the wave's curve, dying out or growing.",
          code: `return state.places.Infected.count;`,
        },
        {
          id: "metric__attack_rate",
          name: "Attack rate",
          description: "Share of the population infected so far.",
          code: `const cases = state.places.Infected.count + state.places.Recovered.count;
const population =
  state.places.Susceptible.count + state.places.Vaccinated.count + cases;
return population === 0 ? 0 : cases / population;`,
        },
      ],
    },
  };
