import { describe, expect, it, vi } from "vitest";

import { getStatusConditionArtifactKey } from "@hashintel/petrinaut-core";

import { validateStatusViewCompiles } from "./status-view-lsp";

import type { SDCPN, StatusView } from "@hashintel/petrinaut-core";

const sdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const extensions = {
  colors: true,
  stochasticity: true,
  dynamics: true,
  parameters: true,
  subnets: true,
};

const makeStatusView = (tokenCondition: string): StatusView => ({
  id: "view-1",
  name: "Ticket status",
  identityRef: "identity-ticket",
  labels: [
    {
      id: "label-1",
      name: "Retrying",
      displayColor: "#f59e0b",
      places: ["doing"],
      tokenCondition,
    },
  ],
});

const emptyArtifacts = {
  version: 4 as const,
  fingerprint: "0000000000000000",
  dynamics: {},
  lambdas: {},
  kernels: {},
  metrics: {},
  statusConditions: {},
};

describe("validateStatusViewCompiles", () => {
  it("passes when every declared condition has a compiled artifact", async () => {
    const statusView = makeStatusView("token.attempts > 0");
    const requestHirArtifacts = vi.fn().mockResolvedValue({
      artifacts: {
        ...emptyArtifacts,
        statusConditions: {
          [getStatusConditionArtifactKey("view-1", "label-1")]: {
            fn: { params: [], body: { kind: "boolLit", value: true } },
          },
        },
      },
      failures: [],
    });

    await expect(
      validateStatusViewCompiles({
        requestHirArtifacts,
        sdcpn,
        extensions,
        statusView,
      }),
    ).resolves.toBeUndefined();
  });

  it("skips the compile round-trip when no label declares a condition", async () => {
    const requestHirArtifacts = vi.fn();

    await expect(
      validateStatusViewCompiles({
        requestHirArtifacts,
        sdcpn,
        extensions,
        statusView: makeStatusView(""),
      }),
    ).resolves.toBeUndefined();
    expect(requestHirArtifacts).not.toHaveBeenCalled();
  });

  it("reports the failing label's diagnostics", async () => {
    const requestHirArtifacts = vi.fn().mockResolvedValue({
      artifacts: emptyArtifacts,
      failures: [
        {
          itemId: "label-1",
          itemType: "status-label-condition",
          diagnostics: [{ message: "Unknown identifier `attemptz`." }],
        },
      ],
    });

    await expect(
      validateStatusViewCompiles({
        requestHirArtifacts,
        sdcpn,
        extensions,
        statusView: makeStatusView("token.attemptz > 0"),
      }),
    ).resolves.toBe('Label "Retrying": Unknown identifier `attemptz`.');
  });

  it("returns a fallback message when compilation yields no diagnostics", async () => {
    const requestHirArtifacts = vi.fn().mockResolvedValue({
      artifacts: emptyArtifacts,
      failures: [],
    });

    await expect(
      validateStatusViewCompiles({
        requestHirArtifacts,
        sdcpn,
        extensions,
        statusView: makeStatusView("token.attempts > 0"),
      }),
    ).resolves.toBe('Label "Retrying": the token condition did not compile.');
  });

  it("turns transport failures into a visible message", async () => {
    const requestHirArtifacts = vi
      .fn()
      .mockRejectedValue(new Error("worker unavailable"));

    await expect(
      validateStatusViewCompiles({
        requestHirArtifacts,
        sdcpn,
        extensions,
        statusView: makeStatusView("token.attempts > 0"),
      }),
    ).resolves.toBe("worker unavailable");
  });
});
