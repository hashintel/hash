import { describe, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import { readCurrentDiagnostics } from "./read-current-diagnostics";

import type {
  LanguageClient,
  Petrinaut,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { PluginDocumentReader } from "@hashintel/petrinaut/ui/plugin";

/** The plugin document's `net` and `diagnose`, as the editor builds them. */
const documentOf = (
  instance: Petrinaut,
  requestDiagnostics: LanguageClient["requestDiagnostics"],
): Pick<PluginDocumentReader, "net" | "diagnose"> => ({
  net: instance.definition,
  diagnose: async () => {
    const net = instance.definition.get();
    const checked = await requestDiagnostics(net, instance.extensions);
    return { ...checked, net };
  },
});

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
        readCurrentDiagnostics(documentOf(instance, request)),
      ).resolves.toContain("No errors or warnings found in net function code.");
      instance.mutations.addParameter({
        id: "rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "2",
      });
      await expect(
        readCurrentDiagnostics(documentOf(instance, request)),
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
      const read = readCurrentDiagnostics(
        documentOf(instance, () => result.promise),
      );
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
        readCurrentDiagnostics(
          documentOf(instance, () =>
            Promise.reject(new Error("Worker terminated")),
          ),
        ),
      ).rejects.toThrow("Worker terminated");
    } finally {
      instance.dispose();
    }
  });
});
