import { describe, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import { readCurrentDiagnostics } from "./read-current-diagnostics";

import type { LanguageClient, SDCPN } from "@hashintel/petrinaut-core";

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
};

describe("readCurrentDiagnostics", () => {
  test("completes repeated clean checks without a pushed diagnostics change", async () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ id: "diagnostics", initial: emptyNet }),
    });
    const request = vi
      .fn<LanguageClient["requestDiagnostics"]>()
      .mockResolvedValue({ byUri: new Map(), total: 0, errorCount: 0 });
    try {
      await expect(
        readCurrentDiagnostics(instance, request),
      ).resolves.toContain("No errors or warnings found in net function code.");
      instance.mutations.addParameter({
        id: "rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "2",
      });
      await expect(
        readCurrentDiagnostics(instance, request),
      ).resolves.toContain("No errors or warnings found in net function code.");
      expect(
        request.mock.calls.map(([definition]) => definition.parameters.length),
      ).toEqual([0, 1]);
      expect(request.mock.calls[1]?.[1]).toBe(instance.extensions);
    } finally {
      instance.dispose();
    }
  });

  test("does not report an older model's clean result as current", async () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ id: "diagnostics", initial: emptyNet }),
    });
    const result =
      Promise.withResolvers<
        Awaited<ReturnType<LanguageClient["requestDiagnostics"]>>
      >();
    try {
      const read = readCurrentDiagnostics(instance, () => result.promise);
      instance.mutations.addParameter({
        id: "rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "2",
      });
      result.resolve({ byUri: new Map(), total: 0, errorCount: 0 });
      await expect(read).resolves.toMatch(/changed.*check again/iu);
      await expect(read).resolves.not.toContain(
        "No errors or warnings found in net function code.",
      );
    } finally {
      instance.dispose();
    }
  });

  test("does not turn worker failure into a clean result", async () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ id: "diagnostics", initial: emptyNet }),
    });
    try {
      await expect(
        readCurrentDiagnostics(instance, () =>
          Promise.reject(new Error("Worker terminated")),
        ),
      ).rejects.toThrow("Worker terminated");
    } finally {
      instance.dispose();
    }
  });
});
