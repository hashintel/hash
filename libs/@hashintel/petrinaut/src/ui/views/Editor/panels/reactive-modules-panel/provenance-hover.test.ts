import { describe, expect, it } from "vitest";

import { provenanceItem, provenanceMarkdown } from "./provenance-hover";

const origins = {
  places: { Waiting: "place-1" },
  transitions: { Serve: "transition-1" },
};

describe("provenanceItem", () => {
  it("maps a place or transition source to its net item", () => {
    expect(
      provenanceItem(
        { what: "Place Waiting", source: { kind: "place", name: "Waiting" } },
        origins,
      ),
    ).toEqual({ type: "place", id: "place-1" });
    expect(
      provenanceItem(
        { what: "Serve fires", source: { kind: "transition", name: "Serve" } },
        origins,
      ),
    ).toEqual({ type: "transition", id: "transition-1" });
  });

  it("has no item for the net, an unknown name or missing origins", () => {
    expect(
      provenanceItem(
        { what: "The system", source: { kind: "net", name: "queue" } },
        origins,
      ),
    ).toBeNull();
    expect(
      provenanceItem(
        { what: "x", source: { kind: "place", name: "Gone" } },
        origins,
      ),
    ).toBeNull();
    expect(
      provenanceItem(
        { what: "x", source: { kind: "place", name: "Waiting" } },
        null,
      ),
    ).toBeNull();
  });
});

describe("provenanceMarkdown", () => {
  it("writes what, why, then the IR path and the canvas hint", () => {
    expect(
      provenanceMarkdown(
        {
          what: "Transition Serve",
          why: "takes from Waiting.",
          ir: "transitions.Serve",
          source: { kind: "transition", name: "Serve" },
        },
        { type: "transition", id: "transition-1" },
      ),
    ).toBe(
      "**Transition Serve**\n\ntakes from Waiting.\n\nIR `transitions.Serve` · transition on the canvas, ⌘-click or Ctrl-click to select",
    );
    expect(provenanceMarkdown({ what: "The system" }, null)).toBe(
      "**The system**",
    );
  });
});
