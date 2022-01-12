import { init } from "./init";

/** Init tests */
const initTopology = {
  x_bounds: [0, 2],
  y_bounds: [0, 2],
};
const agent = {
  agent_name: "test",
  color: "blue",
  foo: 1,
};

const agentFunction = () => ({
  agent_name: "test",
  color: "blue",
  foo: 1,
});

const numAgents = 4;

const scatterAgents = init.scatter(numAgents, initTopology, agent);
const scatterAgentsFunction = init.scatter(
  numAgents,
  initTopology,
  agentFunction,
);
function scatterTest(a: { [key: string]: any }) {
  expect(a.position[0]).toBeGreaterThanOrEqual(initTopology.x_bounds[0]);
  expect(a.position[0]).toBeLessThanOrEqual(initTopology.x_bounds[1]);
  expect(a.position[1]).toBeGreaterThanOrEqual(initTopology.y_bounds[0]);
  expect(a.position[1]).toBeLessThanOrEqual(initTopology.y_bounds[1]);
  expect(a.color).toEqual("blue");
  expect(a.foo).toEqual(1);
}
test("Scatter initialization", () => {
  expect(scatterAgents.length).toEqual(numAgents);
  expect(scatterAgents.length).toEqual(scatterAgentsFunction.length);
  scatterAgents.forEach((a) => scatterTest(a));
  scatterAgentsFunction.forEach((a) => scatterTest(a));
});

const stackAgents = init.stack(numAgents, agent);
const stackAgentsFunction = init.stack(numAgents, agentFunction);
function stackTest(a: { [key: string]: any }) {
  expect(a.color).toEqual("blue");
  expect(a.foo).toEqual(1);
}
test("Stack initialization", () => {
  expect(stackAgents.length).toEqual(numAgents);
  expect(stackAgents.length).toEqual(stackAgentsFunction.length);
  stackAgents.forEach((a) => stackTest(a));
  stackAgentsFunction.forEach((a) => stackTest(a));
});

const gridAgents = init.grid(initTopology, agent);
const gridAgentsFunction = init.grid(initTopology, agentFunction);
function gridTest(a: { [key: string]: any }) {
  expect(a.color).toEqual("blue");
  expect(a.foo).toEqual(1);
  expect(a.position[0]).toBeGreaterThanOrEqual(initTopology.x_bounds[0]);
  expect(a.position[0]).toBeLessThanOrEqual(initTopology.x_bounds[1]);
  expect(a.position[1]).toBeGreaterThanOrEqual(initTopology.y_bounds[0]);
  expect(a.position[1]).toBeLessThanOrEqual(initTopology.y_bounds[1]);
  expect(Math.round(a.position[0])).toEqual(a.position[0]);
  expect(Math.round(a.position[1])).toEqual(a.position[1]);
}
test("Grid initialization", () => {
  expect(gridAgents.length).toEqual(numAgents);
  expect(gridAgents.length).toEqual(gridAgentsFunction.length);
  gridAgents.forEach((a) => gridTest(a));
  gridAgentsFunction.forEach((a) => gridTest(a));
});
