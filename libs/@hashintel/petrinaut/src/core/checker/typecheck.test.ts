import { it } from "vitest";

import type { SDCPN } from "../types/sdcpn";
import { createSDCPNLanguageService } from "./typecheck";

it("works", () => {
  // GIVEN
  const sdcpn: SDCPN = {
    types: [
      {
        id: "color1",
        name: "Red",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [
          {
            elementId: "elem1",
            name: "TokenCount",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "de1",
        colorId: "color1",
        name: "SimpleDecay",
        code: "return tokens.",
      },
    ],
    places: [],
    transitions: [],
    parameters: [],
  };
  const de = sdcpn.differentialEquations[0]!;

  // WHEN
  const service = createSDCPNLanguageService(sdcpn);
  // const diagnostics = service.getSemanticDiagnostics("sdcpn.ts");

  const completion = service.getCompletionsAtPosition(
    `differential_equations/${de.id}/code.ts`,
    46 + de.code.length,
    {},
  );

  // THEN
  console.log(completion);
});
