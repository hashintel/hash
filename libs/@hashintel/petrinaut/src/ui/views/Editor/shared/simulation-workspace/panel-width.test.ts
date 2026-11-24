import { expect, it } from "vitest";

import { simulationPanelWidth } from "./panel-width";

it("takes three fifths of the workspace, up to 960 pixels, before a width is chosen", () => {
  expect(simulationPanelWidth(1200, null).width).toBe(720);
  expect(simulationPanelWidth(2000, null).width).toBe(960);
});

it("keeps a chosen width between 440 pixels and what leaves the list 280", () => {
  expect(simulationPanelWidth(1200, 820)).toEqual({
    minWidth: 440,
    maxWidth: 920,
    width: 820,
  });
  expect(simulationPanelWidth(1200, 2000).width).toBe(920);
  expect(simulationPanelWidth(1200, 100).width).toBe(440);
});

it("fits a chosen width into a narrower workspace without forgetting it", () => {
  expect(simulationPanelWidth(900, 820).width).toBe(620);
  expect(simulationPanelWidth(1200, 820).width).toBe(820);
});

it("leaves the list two fifths of a workspace too narrow for 280 pixels", () => {
  expect(simulationPanelWidth(500, null)).toEqual({
    minWidth: 300,
    maxWidth: 300,
    width: 300,
  });
  expect(simulationPanelWidth(0, 820)).toEqual({
    minWidth: 0,
    maxWidth: 0,
    width: 0,
  });
});
