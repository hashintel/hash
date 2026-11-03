/**
 * Draws a slide's d2 blocks. A fenced block tagged `d2` is rendered when the
 * slide compiles, with the renderer, layout and colours the docs' diagrams
 * use, and inlined as SVG, so it follows the theme as they do. The text
 * after `d2` on the fence names the drawing for a screen reader. Parts the
 * source gives step classes, such as `at-2` or `token-3`, step; see
 * `step-classes.mjs`.
 *
 * Each source is rendered once per process, so editing one block re-renders
 * only that block. Docs pages are left alone: their diagrams come from the
 * bundle.
 */

import { fromHtml } from "hast-util-from-html";
import { visit } from "unist-util-visit";

import { findD2, renderD2Source } from "../../../src/bundle/d2.ts";
import { prepareD2Parts } from "./d2-parts.ts";
import { wrapSteppedParts } from "./svg-steps.ts";

import type { Element, RootContent as HastContent } from "hast";
import type { Code, Parent, Root, RootContent } from "mdast";
import type { VFile } from "vfile";

const rendered = new Map<string, ReturnType<typeof renderD2Source>>();

/** d2's error without the lines it prints about the fonts it loaded. */
const withoutInfo = (error: string): string =>
  error
    .split("\n")
    .filter((line) => !line.startsWith("info:"))
    .join("\n");

const isSvg = (node: HastContent): node is Element =>
  node.type === "element" && node.tagName === "svg";

export const remarkSlideDiagrams =
  (options: {
    docsDirectory: string;
    /** Where d2 runs, inside the repository whose mise provides it. */
    cwd: string;
    fontsDirectory: string;
  }) =>
  async (tree: Root, file: VFile): Promise<void> => {
    if (
      typeof file.path === "string" &&
      file.path.startsWith(options.docsDirectory)
    ) {
      return;
    }
    const blocks: { node: Code; index: number; parent: Parent }[] = [];
    visit(tree, "code", (node, index, parent) => {
      if (node.lang === "d2" && index !== undefined && parent !== undefined) {
        blocks.push({ node, index, parent });
      }
    });
    if (blocks.length === 0) {
      return;
    }
    const path = file.path ?? "slide";
    const d2 = findD2(options.cwd);
    if (d2 === null) {
      throw new Error(
        `${path}: a d2 block needs the d2 command, on the PATH or through mise`,
      );
    }
    await Promise.all(
      blocks.map(async ({ node, index, parent }) => {
        const line = node.position?.start.line ?? 0;
        const render =
          rendered.get(node.value) ??
          renderD2Source({
            command: d2.command,
            cwd: options.cwd,
            source: node.value,
            fontsDirectory: options.fontsDirectory,
          });
        rendered.set(node.value, render);
        const result = await render;
        if (!result.ok) {
          throw new Error(
            `${path}:${line}: d2 could not draw this block\n${withoutInfo(
              result.error,
            ).replace(
              /-:(\d+):(\d+)/gu,
              (_, row: string, column: string) =>
                `${path}:${line + Number(row)}:${column}`,
            )}`,
          );
        }
        const svg = fromHtml(result.svg, {
          space: "svg",
          fragment: true,
        }).children.find(isSvg);
        if (svg === undefined) {
          throw new Error(`${path}:${line}: d2 drew no SVG for this block`);
        }
        try {
          prepareD2Parts(svg);
          wrapSteppedParts(svg);
        } catch (error) {
          throw new Error(
            `${path}:${line}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        parent.children[index] = {
          type: "slideDiagram",
          data: {
            hName: "svg",
            hProperties: {
              ...svg.properties,
              className: ["pnd-diagram"],
              role: "img",
              ...(node.meta ? { ariaLabel: node.meta } : {}),
            },
            hChildren: svg.children,
          },
        } as unknown as RootContent;
      }),
    );
  };
