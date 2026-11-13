import { expect, test } from "vitest";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { initialNetFileData } from "./initial-net.ts";

const net = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

test("a retained run's stored document stages the net it holds", () => {
  const parsed = parseSDCPNFile(
    initialNetFileData({
      id: "document",
      title: "Site 1000 purchasing",
      lastUpdated: "2026-11-12T12:15:10.798Z",
      sdcpn: net,
    }),
  );
  expect(parsed.ok && parsed.sdcpn.title).toBe("Site 1000 purchasing");
});

test("a Petrinaut file passes through unchanged", () => {
  const file = { title: "Café queue", ...net };
  expect(initialNetFileData(file)).toBe(file);
});
