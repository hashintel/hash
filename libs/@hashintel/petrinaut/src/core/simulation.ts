import { computeHazardRate } from "./compute-hazard-rate";

type Transition = {
  id: string;
  name: string;
  inputArcs: { placeId: string; weight: number }[];
  outputArcs: { placeId: string; weight: number }[];
  lambdaCode: string;
  transitionKernelCode: string;
};

type Place = {
  id: string;
  name: string;
  dimensions: number;
  differentialEquationCode: string;
};

type SDCPN = {
  id: string;
  title: string;
  places: Place[];
  transitions: Transition[];
};

enum SimulationState {
  NotStarted,
  Running,
  Paused,
  Completed,
}

export class Simulation {
  state = SimulationState.NotStarted;

  private currentFrameNumber = 0;
  private currentPlaceStates: Map<
    string,
    { values: Float64Array; count: number }
  >;

  private differentialEquationFns: Map<string, Function>;
  private lambdaFns: Map<string, Function>;
  private transitionKernelFns: Map<string, Function>;

  // TODO: We should store current transition lambdas as well, to be able to integrate them.
  // For now, we only compute lambda per frame, without integrating over time.
  // private currentTransitionLambdas: Map<string, Float64Array>;

  constructor(
    private sdcpn: SDCPN,
    initialMarking: Map<string, { values: Float64Array; count: number }>,
    dt: number,
  ) {
    this.currentPlaceStates = initialMarking;
  }

  computeNextState() {
    // At every step, we verify which transitions should be fired,
    // before updating place states using differential equations.
    for (const transition of this.sdcpn.transitions) {
      // Gather input places with their weights relative to this transition.
      const inputPlaces = transition.inputArcs.map((arc) => {
        const placeState = this.currentPlaceStates.get(arc.placeId);
        if (!placeState) {
          throw new Error(
            `Place with ID ${arc.placeId} not found in current marking.`,
          );
        }
        return { ...placeState, weight: arc.weight };
      });

      // Transition is enabled if all input places have more tokens than the arc weight.
      const transitionEnabled = inputPlaces.every(
        (inputPlace) => inputPlace.count >= inputPlace.weight,
      );

      if (transitionEnabled) {
        const lambdaFn = this.lambdaFns.get(transition.id);

        if (!lambdaFn) {
          throw new Error(
            `Lambda function for transition ${transition.id} not found.`,
          );
        }

        // Calculate hazard rates for every combination of input tokens.
        // This is expensive and should be optimized somehow.
        // e.g. If more than 1000 tokens in two places, we can easily have TRILLIONS of combinations.
        // For now, we assume small numbers of tokens.
        const lambdas = computeHazardRate({ inputPlaces, lambdaFn });

        // TODO:

        for (const { combination, hazardRate } of lambdas) {
        }

        // TODO: Use seeded RNG for reproducibility. Should be part of Simulation input.
        const U1 = Math.random();
      }
    }
  }
}
