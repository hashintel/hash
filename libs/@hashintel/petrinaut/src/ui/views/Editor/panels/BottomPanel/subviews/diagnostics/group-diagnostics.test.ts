import { describe, expect, it } from "vitest";

import {
  getDocumentUri,
  getMetricDocumentUri,
  type Diagnostic,
} from "@hashintel/petrinaut-core";

import { groupDiagnosticsByEntity } from "./group-diagnostics";

const diagnostic = (message: string): Diagnostic => ({
  message,
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
});

const net = {
  transitions: [{ id: "t1", name: "Ship" }],
  differentialEquations: [{ id: "de1", name: "Decay" }],
  places: [{ id: "p1", name: "Depot" }],
};

describe("groupDiagnosticsByEntity", () => {
  it("lists a transition's lambda and kernel under the one transition", () => {
    const lambda = getDocumentUri("transition-lambda", "t1");
    const kernel = getDocumentUri("transition-kernel", "t1");
    const lambdaDiagnostics = [diagnostic("first"), diagnostic("second")];
    const kernelDiagnostics = [diagnostic("third")];

    expect(
      groupDiagnosticsByEntity(
        new Map([
          [lambda, lambdaDiagnostics],
          [kernel, kernelDiagnostics],
        ]),
        net,
      ),
    ).toEqual([
      {
        entityType: "transition",
        entityId: "t1",
        label: "Transition: Ship",
        errorCount: 3,
        documents: [
          { uri: lambda, part: "Lambda", diagnostics: lambdaDiagnostics },
          { uri: kernel, part: "Kernel", diagnostics: kernelDiagnostics },
        ],
      },
    ]);
  });

  it("names what each entity is, and no part where it has one code", () => {
    const groups = groupDiagnosticsByEntity(
      new Map([
        [getDocumentUri("place-visualizer", "p1"), [diagnostic("first")]],
        [
          getDocumentUri("differential-equation", "de1"),
          [diagnostic("second")],
        ],
      ]),
      net,
    );

    expect(
      groups.map((group) => [
        group.entityType,
        group.label,
        group.documents.map((codeDocument) => codeDocument.part),
      ]),
    ).toEqual([
      ["place", "Place: Depot", ["Visualizer"]],
      ["differentialEquation", "Differential Equation: Decay", [null]],
    ]);
  });

  it("lists a net's own visualizer under the net: the root net, or a component by name", () => {
    const groups = groupDiagnosticsByEntity(
      new Map([
        [getDocumentUri("net-visualizer", "root"), [diagnostic("first")]],
        [getDocumentUri("net-visualizer", "c1"), [diagnostic("second")]],
      ]),
      { ...net, components: [{ id: "c1", name: "Station" }] },
    );

    expect(
      groups.map((group) => [
        group.entityType,
        group.entityId,
        group.label,
        group.documents.map((codeDocument) => codeDocument.part),
      ]),
    ).toEqual([
      ["net", "root", "Net: Root", ["Visualizer"]],
      ["net", "c1", "Net: Station", ["Visualizer"]],
    ]);
  });

  it("falls back to the id of an entity the net does not hold", () => {
    const [group] = groupDiagnosticsByEntity(
      new Map([[getDocumentUri("transition-kernel", "gone"), []]]),
      net,
    );

    expect(group?.label).toBe("Transition: gone");
  });

  it("leaves out a document that is not the code of an entity", () => {
    expect(
      groupDiagnosticsByEntity(
        new Map([[getMetricDocumentUri("session"), [diagnostic("first")]]]),
        net,
      ),
    ).toEqual([]);
  });
});
