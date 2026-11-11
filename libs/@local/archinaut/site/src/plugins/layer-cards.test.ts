import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { layerFacts, remarkLayerCards } from "./layer-cards.mjs";

import type { Root, RootContent } from "mdast";

const layer = (id: string, name: string) => ({
  id,
  name,
  role: `What ${name} does`,
  package: "@example/core",
  fileCount: 1200,
  lineCount: 34000,
});

const model = {
  layers: [layer("core", "Core"), layer("ui", "UI"), layer("solver", "Solver")],
  edges: [
    { from: "ui", to: "core", provenance: "imports", fileDependencies: 40 },
    { from: "core", to: "solver", provenance: "declared", protocol: "RPC" },
  ],
};

describe("layerFacts", () => {
  it("lists a layer's dependencies both ways, strongest first", () => {
    expect(layerFacts(model, "core", 4)).toEqual({
      id: "core",
      name: "Core",
      role: "What Core does",
      package: "@example/core",
      fileCount: 1200,
      lineCount: 34000,
      dependsOn: [{ id: "solver", name: "Solver", label: "RPC" }],
      dependedOnBy: [{ id: "ui", name: "UI", label: "40" }],
    });
    expect(layerFacts(model, "nowhere", 4)).toBeNull();
  });
});

describe("remarkLayerCards", () => {
  const card = (attributes: { name: string; value: unknown }[]) => ({
    type: "mdxJsxFlowElement" as const,
    name: "LayerCard",
    attributes: attributes.map((attribute) => ({
      type: "mdxJsxAttribute" as const,
      ...attribute,
    })),
    children: [],
  });
  const modelPath = join(
    mkdtempSync(join(tmpdir(), "layer-cards-")),
    "architecture.json",
  );
  writeFileSync(modelPath, JSON.stringify(model));
  const compile = (node: unknown, path = "/decks/tour/1-layer.mdx") => {
    const tree: Root = { type: "root", children: [node as RootContent] };
    remarkLayerCards({ docsDirectory: "/site/docs/", modelPath })(tree, {
      path,
    } as never);
    return node as { attributes: { name: string; value: { value: string } }[] };
  };

  it("replaces the layer id with its facts", () => {
    const node = compile(
      card([
        { name: "layer", value: "core" },
        {
          name: "limit",
          value: { type: "mdxJsxAttributeValueExpression", value: "1" },
        },
      ]),
    );
    expect(node.attributes.map((attribute) => attribute.name)).toEqual([
      "facts",
    ]);
    expect(JSON.parse(node.attributes[0]!.value.value)).toMatchObject({
      name: "Core",
      dependedOnBy: [{ id: "ui", label: "40" }],
    });
  });

  it("fails the compile on a layer the model does not have", () => {
    expect(() => compile(card([{ name: "layer", value: "nowhere" }]))).toThrow(
      /1-layer\.mdx:\?: <LayerCard> names "nowhere"/u,
    );
  });

  it("refuses a layer that is not a literal", () => {
    expect(() =>
      compile(
        card([
          {
            name: "layer",
            value: { type: "mdxJsxAttributeValueExpression", value: "id" },
          },
        ]),
      ),
    ).toThrow(/takes a literal layer/u);
  });

  it("leaves docs pages alone", () => {
    const node = card([{ name: "layer", value: "core" }]);
    expect(compile(node, "/site/docs/page.mdx").attributes[0]?.name).toBe(
      "layer",
    );
  });
});
