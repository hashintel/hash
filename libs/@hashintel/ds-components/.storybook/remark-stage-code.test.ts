import { compile } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";

import { remarkStageCode } from "./remark-stage-code";

import type { Root, RootContent } from "mdast";

/**
 * Compiles MDX through the real pipeline with the plugin installed and
 * collects what each Stage's `code` attribute ends up as: the injected (or
 * authored) string, or null when the attribute is absent or an expression.
 */
const compileStages = async (
  mdx: string,
): Promise<{ codes: (string | null)[]; output: string }> => {
  const codes: (string | null)[] = [];
  const collect = () => (tree: Root) => {
    const walk = (node: Root | RootContent): void => {
      if (node.type === "mdxJsxFlowElement" && node.name === "Stage") {
        const attribute = node.attributes.find(
          (candidate) =>
            candidate.type === "mdxJsxAttribute" && candidate.name === "code",
        );
        codes.push(
          typeof attribute?.value === "string" ? attribute.value : null,
        );
      }
      if ("children" in node) {
        for (const child of node.children) {
          walk(child);
        }
      }
    };
    walk(tree);
  };
  const output = await compile(mdx, {
    remarkPlugins: [remarkStageCode, collect],
  });
  return { codes, output: String(output) };
};

describe("remarkStageCode", () => {
  it("injects the authored source, dedented to the Stage", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        '  <Button variant="subtle" onClick={() => console.log("hi")}>',
        "    Filters",
        "  </Button>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      [
        '<Button variant="subtle" onClick={() => console.log("hi")}>',
        "  Filters",
        "</Button>",
      ].join("\n"),
    ]);
  });

  it("keeps multi-line props and expression children verbatim", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <TextInput",
        '    label="Workspace name"',
        '    value="Acme"',
        '    suffix={<Icon name="check" />}',
        "  />",
        "  <Banner>",
        '    {"Members inherited from parent teams must be re-added."}',
        "  </Banner>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      [
        "<TextInput",
        '  label="Workspace name"',
        '  value="Acme"',
        '  suffix={<Icon name="check" />}',
        "/>",
        "<Banner>",
        '  {"Members inherited from parent teams must be re-added."}',
        "</Banner>",
      ].join("\n"),
    ]);
  });

  it("preserves an authored blank line between siblings", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <Button>A</Button>",
        "",
        "  <Button>B</Button>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      ["<Button>A</Button>", "", "<Button>B</Button>"].join("\n"),
    ]);
  });

  it("unwraps a data-harness element, re-indenting its children", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <DemoState data-harness>",
        "    <TextInput",
        '      label="Workspace name"',
        '      value="Acme"',
        "      onChange={() => {}}",
        "    />",
        "  </DemoState>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      [
        "<TextInput",
        '  label="Workspace name"',
        '  value="Acme"',
        "  onChange={() => {}}",
        "/>",
      ].join("\n"),
    ]);
  });

  it("unwraps nested harness elements", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <Column data-harness>",
        "    <DemoState data-harness>",
        "      <Switch checked onChange={() => {}} />",
        "    </DemoState>",
        '    <Banner tone="brand">Ready</Banner>',
        "  </Column>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      [
        "<Switch checked onChange={() => {}} />",
        '<Banner tone="brand">Ready</Banner>',
      ].join("\n"),
    ]);
  });

  it("keeps a visible element's tags around an unwrapped descendant", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        '  <Card title="Settings">',
        "    <DemoState data-harness>",
        "      <Switch checked />",
        "    </DemoState>",
        "  </Card>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      ['<Card title="Settings">', "  <Switch checked />", "</Card>"].join("\n"),
    ]);
  });

  it('drops a data-harness="omit" subtree', async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        '  <Spacer data-harness="omit" />',
        "  <Button>A</Button>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual(["<Button>A</Button>"]);
  });

  it("does not invent a blank line around an omitted sibling", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <Button>A</Button>",
        '  <OverlayDemo data-harness="omit">',
        "    <Button>X</Button>",
        "  </OverlayDemo>",
        "  <Button>B</Button>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      ["<Button>A</Button>", "<Button>B</Button>"].join("\n"),
    ]);
  });

  it("keeps an authored blank line next to an omitted sibling", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <Button>A</Button>",
        "",
        '  <Spacer data-harness="omit" />',
        "  <Button>B</Button>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      ["<Button>A</Button>", "", "<Button>B</Button>"].join("\n"),
    ]);
  });

  it("rejects unknown data-harness values", async () => {
    await expect(
      compileStages(
        ["<Stage>", '  <Column data-harness="hide" />', "</Stage>"].join("\n"),
      ),
    ).rejects.toThrow(/data-harness/);
  });

  it("leaves Stages with an authored code attribute alone", async () => {
    const { codes } = await compileStages(
      [
        'export const sample = "<Dialog />";',
        "",
        '<Stage code="custom">',
        "  <Button>A</Button>",
        "</Stage>",
        "",
        "<Stage code={sample}>",
        "  <Button>B</Button>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual(["custom", null]);
  });

  it("shows noop handler references as plain arrows", async () => {
    const { codes } = await compileStages(
      [
        "<Stage>",
        "  <DemoState data-harness>",
        '    <Checkbox value label="Drafts" onChange={noop} />',
        "  </DemoState>",
        "</Stage>",
        "",
        "<Stage>",
        "  <Banner dismissible={{ onDismiss: noop }}>Saved</Banner>",
        "</Stage>",
      ].join("\n"),
    );
    expect(codes).toEqual([
      '<Checkbox value label="Drafts" onChange={() => {}} />',
      "<Banner dismissible={{ onDismiss: () => {} }}>Saved</Banner>",
    ]);
  });

  it("strips data-harness from the compiled output", async () => {
    const { output } = await compileStages(
      [
        "<Stage>",
        "  <DemoState data-harness>",
        "    <Switch checked />",
        "  </DemoState>",
        "</Stage>",
        "",
        '<OverlayDemo data-harness="omit" />',
      ].join("\n"),
    );
    expect(output).not.toContain("data-harness");
  });
});
