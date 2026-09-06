export type SimulationParameterBounds = {
  min: number;
  max: number;
  step?: number;
};

export type SimulationParameterBoundsByIdentifier = Readonly<
  Record<string, SimulationParameterBounds>
>;

export const clampSimulationParameterValue = (
  value: number,
  bounds?: SimulationParameterBounds,
): number =>
  bounds ? Math.min(bounds.max, Math.max(bounds.min, value)) : value;
