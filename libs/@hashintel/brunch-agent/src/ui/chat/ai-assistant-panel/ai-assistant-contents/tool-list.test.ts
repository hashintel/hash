import { describe, expect, test } from "vitest";

import {
  hashPetrinautTools,
  hashProcessEditorId,
} from "../../../../hash/petrinaut-tools";
import { resolveBrunchToolPresentation } from "../../../tools/brunch-tool-presentation";
import { toToolRenderItem, type RenderableToolPart } from "./tool-list";

import type { PetrinautAiMessage } from "../types";

const message: PetrinautAiMessage = {
  id: "turn",
  role: "assistant",
  parts: [],
};

const row = (
  toolName: string,
  state: string,
  input: unknown,
  output?: unknown,
) =>
  toToolRenderItem(
    message,
    {
      type: "dynamic-tool",
      toolName,
      toolCallId: `${toolName}-call`,
      state,
      input,
      output,
    } as RenderableToolPart,
    [],
    resolveBrunchToolPresentation,
  );

const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  targetSubnetId: null,
};
const onEditor = <Input extends object>(input: Input) => ({
  editor_id: hashProcessEditorId,
  ...input,
});

describe("HASH's Petrinaut tool rows", () => {
  test("present a create as the canonical operation it runs", () => {
    const hash = row(
      "petrinaut_create_place",
      "input-available",
      onEditor(place),
    );
    const canonical = row("addPlace", "input-available", place);

    expect(hash.summary).toEqual(canonical.summary);
    // No result yet, so it names the requested action, as the canonical row does.
    expect(hash.summary.title).toBe("Add place Queue");
    expect(hash.tone).toBe(canonical.tone);
  });

  test("present a removal with the canonical removal's tone", () => {
    const input = { placeId: "queue", targetSubnetId: null };
    const hash = row("petrinaut_remove_place", "input-available", {
      ...input,
      editor_id: hashProcessEditorId,
    });
    const canonical = row("removePlace", "input-available", input);

    expect(hash.summary).toEqual(canonical.summary);
    expect(hash.tone).toBe("danger");
  });

  test("present a merged update as every canonical call it makes", () => {
    const hash = row(
      "petrinaut_update_place",
      "input-available",
      onEditor({
        placeId: "queue",
        update: { name: "Line" },
        position: { x: 10, y: 20 },
        targetSubnetId: null,
      }),
    );
    const fields = row("updatePlace", "input-available", {
      placeId: "queue",
      update: { name: "Line" },
      targetSubnetId: null,
    });
    const position = row("updatePlacePosition", "input-available", {
      placeId: "queue",
      position: { x: 10, y: 20 },
      targetSubnetId: null,
    });

    expect(hash.summary.title).toBe(
      `${fields.summary.title}; ${position.summary.title}`,
    );
    expect(hash.summary.target).toEqual(fields.summary.target);
  });

  test("keep the page's applied output once it settles", () => {
    expect(
      row("petrinaut_create_place", "output-available", onEditor(place), {
        applied: true,
        title: "Added place Queue",
      }).summary.title,
    ).toBe("Added place Queue");
  });

  test("present a read as its canonical read, not as the net's title", () => {
    const read = row(
      "petrinaut_get_net",
      "output-available",
      onEditor({ detail: "outline" }),
      { title: "Clinic", definition: {}, extensions: {} },
    );

    expect(read.summary.title).toBe("Checked latest net definition");
    expect(read.tone).toBe("neutral");
  });

  test("name a streaming call by its operation, not its model-facing name", () => {
    expect(
      row("petrinaut_create_place", "input-streaming", {}).summary,
    ).toEqual({ title: "Add place" });
    // The website's agent keeps Petrinaut's names, and its streaming rows.
    expect(row("addPlace", "input-streaming", {}).summary).toEqual({
      title: "addPlace",
    });
  });

  test("present an experiment by its name and outcome", () => {
    const request = onEditor({ name: "Peak load" });

    expect(
      row("petrinaut_create_experiment", "input-available", request).summary
        .title,
    ).toBe("Running experiment Peak load");
    expect(
      row("petrinaut_create_experiment", "output-available", request, {
        status: "complete",
        experimentId: "experiment-1",
        name: "Peak load",
        runsCompleted: 8,
        metrics: [],
      }).summary.title,
    ).toBe("Ran experiment Peak load");
  });

  test.each(Object.keys(hashPetrinautTools))(
    "%s never presents under its model-facing name",
    (toolName) => {
      for (const [state, input] of [
        ["input-streaming", {}],
        ["input-available", onEditor({})],
      ] as const) {
        const { title } = row(toolName, state, input).summary;
        expect(title).not.toMatch(/petrinaut_/iu);
        expect(title).not.toBe(toolName);
      }
    },
  );
});

describe("HASH's other tool rows", () => {
  test.each([
    ["hash_query_entities", "Looked up entities in HASH"],
    ["hash_query_entity_types", "Looked up entity types in HASH"],
    ["hash_query_webs", "Listed your HASH webs"],
    ["app_save_net", "Saved the net"],
    ["ledger_query", "Read the Ledger"],
    ["ledger_query_basis", "Checked recorded basis"],
  ])("%s is titled %s", (toolName, title) => {
    expect(
      row(toolName, "output-available", {}, { status: "saved" }).summary.title,
    ).toBe(title);
  });
});
