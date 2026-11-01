import { describe, expect, it } from "vitest";

import { printPetrinautDsl } from "@hashintel/petrinaut-core";
import { assemblyLine } from "@hashintel/petrinaut-core/examples";

import { analyzeDslDraft, countErrors } from "./dsl-draft";

const net = assemblyLine.petriNetDefinition;

describe("analyzeDslDraft", () => {
  it("gives the net an edited text describes, with the ids of the net it edits", () => {
    const { text } = printPetrinautDsl({ sdcpn: net, title: "Line" });

    const analysis = analyzeDslDraft(
      net,
      text.replace("place Buffer capacity 5 start", "place Buffer capacity 9"),
    );

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.title).toBe("Line");
    const buffer = analysis.net!.places.find(({ name }) => name === "Buffer")!;
    expect(buffer).toMatchObject({
      id: net.places.find(({ name }) => name === "Buffer")!.id,
      capacity: 9,
    });
    expect(buffer.showAsInitialState).toBeUndefined();
  });

  it("gives no net while a line fails to parse, and none while a reference fails to resolve", () => {
    const { text } = printPetrinautDsl({ sdcpn: net });

    const broken = analyzeDslDraft(net, `${text}place\n`);
    const dangling = analyzeDslDraft(net, `${text}fuse Buffer, Nobody.In\n`);

    expect(broken.net).toBeNull();
    expect(countErrors(broken.diagnostics)).toBe(1);
    expect(broken.diagnostics[0]!.message).toMatch(/Expected a place name/u);
    expect(dangling.net).toBeNull();
    expect(dangling.diagnostics.map(({ message }) => message)).toEqual([
      'Unknown instance "Nobody"',
    ]);
  });
});
