import type { KeyTree } from "../key-tree";

const place = {
  id: true,
  name: true,
  description: true,
  colorId: true,
  dynamicsEnabled: true,
  differentialEquationId: true,
  capacity: true,
  isPort: true,
  visualizerCode: true,
  showAsInitialState: true,
  x: true,
  y: true,
} satisfies KeyTree;

const transition = {
  id: true,
  name: true,
  description: true,
  metadata: true,
  inputArcs: { placeId: true, endpoint: true, weight: true, type: true },
  outputArcs: { placeId: true, endpoint: true, weight: true },
  lambdaType: true,
  lambdaCode: true,
  transitionKernelCode: true,
  x: true,
  y: true,
} satisfies KeyTree;

const type = {
  id: true,
  name: true,
  description: true,
  iconSlug: true,
  displayColor: true,
  elements: { elementId: true, name: true, type: true },
} satisfies KeyTree;

const differentialEquation = {
  id: true,
  name: true,
  colorId: true,
  code: true,
} satisfies KeyTree;

const parameter = {
  id: true,
  name: true,
  variableName: true,
  type: true,
  defaultValue: true,
} satisfies KeyTree;

const componentInstance = {
  id: true,
  name: true,
  description: true,
  metadata: true,
  subnetId: true,
  parameterValues: true,
  x: true,
  y: true,
} satisfies KeyTree;

const scenario = {
  id: true,
  name: true,
  description: true,
  scenarioParameters: { type: true, identifier: true, default: true },
  parameterOverrides: true,
  initialState: true,
} satisfies KeyTree;

const metric = {
  id: true,
  name: true,
  description: true,
  code: true,
} satisfies KeyTree;

const net = {
  description: true,
  metadata: true,
  places: place,
  transitions: transition,
  types: type,
  differentialEquations: differentialEquation,
  parameters: parameter,
  componentInstances: componentInstance,
} satisfies KeyTree;

/**
 * The keys of file format version 1. A key the format gains later stays out
 * of this tree: a file that uses one is written as version 2.
 */
export const version1Keys: KeyTree = {
  version: true,
  meta: { generator: true, generatorVersion: true },
  title: true,
  ...net,
  scenarios: scenario,
  metrics: metric,
  subnets: { id: true, name: true, ...net },
};
