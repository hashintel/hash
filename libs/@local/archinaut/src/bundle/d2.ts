/**
 * The d2 renderer: finding the command, running it on one source, and
 * making the SVG it writes themeable by a host.
 */

import { execFile, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { messageOf } from "../shared/diagnostics";
import { themeableColours } from "./shared/palette";

const probeD2 = (repoRoot: string): D2 | null => {
  for (const command of [
    ["d2"],
    ["mise", "exec", "--env", "dev", "--", "d2"],
  ]) {
    const [executable = "", ...prefix] = command;
    const result = spawnSync(executable, [...prefix, "--version"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (!result.error && result.status === 0) {
      return { command, version: result.stdout.trim() };
    }
  }
  return null;
};

export interface D2 {
  command: string[];
  /** What `--version` printed, which keys rendered output. */
  version: string;
}

const d2Commands = new Map<string, D2 | null>();

/** The d2 command for this repository, probed once per process. */
export const findD2 = (repoRoot: string): D2 | null => {
  const known = d2Commands.get(repoRoot);
  if (known !== undefined) {
    return known;
  }
  const found = probeD2(repoRoot);
  d2Commands.set(repoRoot, found);
  return found;
};

const run = promisify(execFile);

/** Runs a command to completion; a non-zero exit or a spawn failure is an error string. */
const execute = async (
  executable: string,
  args: string[],
  cwd: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    await run(executable, args, { cwd, encoding: "utf8" });
    return { ok: true };
  } catch (cause) {
    const output = cause as { stdout?: string; stderr?: string };
    return {
      ok: false,
      error:
        [output.stderr, output.stdout].find((text) => text) ?? messageOf(cause),
    };
  }
};

/**
 * `d2`'s own palette, as it writes it into every SVG: seven neutrals and the
 * blues it draws connections and links with. Restated here so the appended
 * stylesheet can hand each one to a custom property.
 *
 * Taken from the rendered output rather than from a `d2` theme file, because
 * these are the values it bakes in at the default theme.
 */
const rendererPalette: Record<string, string> = {
  n1: "#0A0F25",
  n2: "#676C7E",
  n3: "#9499AB",
  n4: "#CFD2DD",
  n5: "#DEE1EB",
  n6: "#EEF1F8",
  n7: "#FFFFFF",
  b1: "#0D32B2",
  b2: "#0D32B2",
  b3: "#E3E9FD",
  b4: "#E3E9FD",
  b5: "#EDF0FD",
  b6: "#F7F8FE",
};

/**
 * Rewrites a rendered diagram so a host page can recolour it.
 *
 * `d2` writes its palette straight into the markup, so a drawing carries one
 * theme and keeps it. Each colour it drew is restated here as a custom property
 * holding that same colour as its fallback, scoped to the `d2-<hash>` class the
 * renderer puts on the drawing: a host that defines none of them gets exactly
 * what `d2` drew, and one that defines them can follow its own light and dark
 * themes. Markup carrying no such class is returned untouched.
 *
 * Appended as a stylesheet rather than rewritten into the markup: `var()` is
 * not reliably honoured inside SVG presentation attributes, where the layer
 * colours land, but a later rule under the same scope overrides them.
 */
export const withThemeableColours = (markup: string): string => {
  const scope = /class="(d2-\d+)/u.exec(markup)?.[1];

  if (scope === undefined) {
    return markup;
  }

  const rules = [
    ...Object.entries(rendererPalette).flatMap(([token, colour]) => [
      `.${scope} .fill-${token.toUpperCase()}{fill:var(--pnd-diagram-${token},${colour});}`,
      `.${scope} .stroke-${token.toUpperCase()}{stroke:var(--pnd-diagram-${token},${colour});}`,
    ]),
    ...Object.entries(themeableColours).flatMap(([name, { fill, stroke }]) => [
      `.${scope} [fill="${fill}"]{fill:var(--pnd-diagram-${name}-fill,${fill});}`,
      `.${scope} [stroke="${stroke}"]{stroke:var(--pnd-diagram-${name}-stroke,${stroke});}`,
    ]),
  ].join("\n");

  return markup.replace(
    "</svg>",
    `<style type="text/css"><![CDATA[\n${rules}\n]]></style></svg>`,
  );
};

/**
 * Strips the badges d2 draws beside a node that carries a tooltip or a
 * link. The tooltip is the node's `<title>`, which browsers show on hover,
 * and the link wraps the node itself, so the badges only announce what the
 * node already does, outside the palette and over the connections.
 */
export const withoutBadges = (markup: string): string =>
  markup.replace(/<g[^>]*class="appendix-icon">[\s\S]*?<\/svg>\s*<\/g>/gu, "");

/**
 * Renders a `.d2` file to SVG.
 *
 * `d2` comes from PATH or from mise. When it is unavailable the caller is told
 * rather than the build failing outright: the `.d2` sources are the diffable
 * artefact, and a missing renderer should not block regenerating the model
 * and pages.
 *
 * Rendered with the same face the docs are set in. This is not decoration: `d2`
 * measures every label with the font it renders with and sizes the boxes from
 * that, so a diagram drawn in one face and displayed in another has labels that
 * no longer fit. The padding is `d2`'s 100px default cut to something that
 * leaves the drawing room without a frame of empty page around it.
 */
export const renderD2 = async (options: {
  command: string[];
  repoRoot: string;
  sourcePath: string;
  outputPath: string;
  fontsDirectory: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { repoRoot, sourcePath, outputPath, fontsDirectory } = options;
  const [executable = "", ...prefix] = options.command;
  const result = await execute(
    executable,
    [
      ...prefix,
      "--layout",
      "elk",
      "--pad",
      "16",
      "--font-regular",
      `${fontsDirectory}/Inter-Regular.ttf`,
      "--font-bold",
      `${fontsDirectory}/Inter-Bold.ttf`,
      sourcePath,
      outputPath,
    ],
    repoRoot,
  );
  if (!result.ok) {
    return result;
  }

  try {
    await writeFile(
      outputPath,
      withThemeableColours(withoutBadges(await readFile(outputPath, "utf8"))),
    );
  } catch (error) {
    return { ok: false, error: String(error) };
  }

  return { ok: true };
};
