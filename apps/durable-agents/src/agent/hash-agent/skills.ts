/**
 * HASH's skills on Pi Durable, which has none of its own: the skill catalogue
 * as a prompt section, and `activate_skill` and `read_skill_resource` over the
 * skills copied under `guidance/skills/`.
 *
 * Each piece reproduces what Flue (`@flue/runtime`) gives Brunch's HASH agent
 * for the same directories, so the model reads the same text:
 *
 * - a skill is packaged as Flue's build packages an imported `SKILL.md`:
 *   every file under its directory, with the ID
 *   `skill:<name>:<first 16 hex digits of a SHA-256 over its sorted files>`;
 * - `activate_skill` returns Flue's `buildPackagedSkillPrompt` text, whose
 *   `<skill_resources>` name `/.flue/packaged-skills/<encoded ID>/<path>`,
 *   so the skills' own cross-references and the panel's tool titles work
 *   unchanged;
 * - `read_skill_resource` serves those paths, formatted as Flue's packaged
 *   read tool formats them;
 * - the section renders composeSystemPrompt's "Available Skills" block.
 *
 * The tool descriptions and schemas are Flue's, as H0c sent them to OpenAI
 * (`test/smoke/hash-schemas.ts`). Flue's `task` tool and "Available Agents"
 * section are not ported: HASH declares no subagents.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";

import { brunchTools } from "@hashintel/brunch-agent";

import type { Schema } from "@earendil-works/pi-schema";

/** Brunch's HASH agent mounts its skills in this order (`guidance.ts`), which is the catalogue's. */
export const hashSkillNames = [
  "eliciting",
  "modelling",
  "petrinaut",
  "hash-graph",
] as const;

/** The copies' root; the drift test compares it with Brunch's `skills/`. */
export const hashSkillsDirectory = new URL("guidance/skills/", import.meta.url);

/** One skill as Flue packages it. */
export type PackagedSkill = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The text after the frontmatter, trimmed. */
  readonly body: string;
  /** By path relative to the skill's directory, `SKILL.md` included. */
  readonly files: Readonly<Record<string, string>>;
};

const packagedSkillsRoot = "/.flue/packaged-skills/";

/** Flue's `formatPackagedSkillFilePath`. */
export const skillResourcePath = (skillId: string, filePath: string) =>
  `${packagedSkillsRoot}${encodeURIComponent(skillId)}/${filePath}`;

/**
 * The frontmatter's `name` and `description`, and the body, as Flue's
 * `parseSkillMarkdown` reads them. The copies' frontmatter is single-line
 * `key: value` pairs, so this reads only those, where Flue parses YAML; any
 * other frontmatter throws rather than read differently.
 */
const parseSkillMarkdown = (content: string, directoryName: string) => {
  const match = content
    .replace(/^\uFEFF/, "")
    .match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    throw new Error(`Skill ${directoryName} is missing YAML frontmatter.`);
  }
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = line.match(/^([a-z-]+):[ \t]+(\S.*)$/);
    if (!field?.[1] || field[2] === undefined || /^["'|>&*!%@`]/.test(field[2]))
      throw new Error(
        `Skill ${directoryName} has frontmatter this reader does not parse: ${line}`,
      );
    fields.set(field[1], field[2].trim());
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (name !== directoryName || !description) {
    throw new Error(
      `Skill ${directoryName} must name itself after its directory and have a description.`,
    );
  }
  return { name, description, body: (match[2] ?? "").trim() };
};

/** Every file under `directory`, by path relative to `root`, sorted as Flue's `collectFiles` sorts them. */
const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}/${entry.name}`)
    .toSorted();

/** Flue's `buildPackagedSkill` ID: a SHA-256 over each file's lengths, path and content, sorted by path. */
const packagedSkillId = (
  name: string,
  files: readonly { path: string; content: Buffer }[],
) => {
  const hash = createHash("sha256");
  for (const { path, content } of files.toSorted((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )) {
    const pathBytes = Buffer.from(path, "utf8");
    const lengths = Buffer.alloc(8);
    lengths.writeUInt32BE(pathBytes.byteLength, 0);
    lengths.writeUInt32BE(content.byteLength, 4);
    hash.update(lengths).update(pathBytes).update(content);
  }
  return `skill:${name}:${hash.digest("hex").slice(0, 16)}`;
};

/** A skill directory packaged as Flue's build packages it. */
export const packageSkill = (directory: URL): PackagedSkill => {
  const root = fileURLToPath(directory);
  const files = filesUnder(root).map((absolutePath) => ({
    path: relative(root, absolutePath).split("\\").join("/"),
    content: readFileSync(absolutePath),
  }));
  const skillFile = files.find(({ path }) => path === "SKILL.md");
  const directoryName = root.split("/").findLast((part) => part !== "") ?? "";
  if (!skillFile) throw new Error(`Skill ${directoryName} has no SKILL.md.`);
  const { name, description, body } = parseSkillMarkdown(
    skillFile.content.toString("utf8"),
    directoryName,
  );
  return {
    id: packagedSkillId(name, files),
    name,
    description,
    body,
    files: Object.fromEntries(
      files.map(({ path, content }) => [path, content.toString("utf8")]),
    ),
  };
};

/** HASH's four skills, packaged from the copies, in catalogue order. */
export const hashSkills: readonly PackagedSkill[] = hashSkillNames.map((name) =>
  packageSkill(new URL(`${name}/`, hashSkillsDirectory)),
);

/** composeSystemPrompt's "Available Skills" block for `skills`. */
export const renderSkillCatalogue = (skills: readonly PackagedSkill[]) =>
  [
    "## Available Skills",
    "",
    "The following skills provide specialized instructions for specific tasks. When a task matches a skill description, call the `activate_skill` tool with that skill name before proceeding so its full instructions are loaded. Skill instructions and supporting resources stay lazy until activation or explicit file reads.",
    "",
    ...skills.map(({ name, description }) => `- **${name}** — ${description}`),
  ].join("\n");

/** What `activate_skill` returns for `name`: Flue's `activateSkillForTool` over packaged skills. */
export const activateSkillText = (
  skills: readonly PackagedSkill[],
  name: string,
) => {
  const skill = skills.find((candidate) => candidate.name === name);
  if (!skill) {
    return `Skill "${name}" is not available. Available skills: ${skills.map((candidate) => candidate.name).join(", ")}.`;
  }
  const resources = Object.keys(skill.files)
    .filter((filePath) => filePath !== "SKILL.md")
    .toSorted();
  return [
    `Run the skill named "${skill.name}".`,
    "",
    "<skill_instructions>",
    skill.body,
    "</skill_instructions>",
    ...(resources.length > 0
      ? [
          "",
          "Supporting skill resources are available but are not loaded into context unless needed:",
          "<skill_resources>",
          ...resources.map(
            (filePath) =>
              `- ${filePath} → ${brunchTools.readSkillResource} ${skillResourcePath(skill.id, filePath)}`,
          ),
          "</skill_resources>",
        ]
      : []),
  ].join("\n");
};

const maxReadLines = 2000;
const maxReadBytes = 51200;

/** Flue's `truncateHead`: whole lines from the start, within both limits. */
const truncateHead = (lines: readonly string[]) => {
  let text = "";
  let linesEmitted = 0;
  for (const line of lines) {
    if (linesEmitted >= maxReadLines) return { text, linesEmitted, cut: true };
    const next = linesEmitted === 0 ? line : `\n${line}`;
    if (text.length + next.length > maxReadBytes) {
      return {
        text: linesEmitted === 0 ? line.slice(0, maxReadBytes) : text,
        linesEmitted,
        cut: true,
      };
    }
    text += next;
    linesEmitted++;
  }
  return { text, linesEmitted, cut: false };
};

/**
 * What `read_skill_resource` returns for `path`: Flue's packaged read tool.
 * A path without its leading `/` is accepted; an unknown path throws.
 */
export const readSkillResource = (
  skills: readonly PackagedSkill[],
  input: { path: string; offset?: number; limit?: number },
) => {
  const path = input.path.startsWith(packagedSkillsRoot.slice(1))
    ? `/${input.path}`
    : input.path;
  const content = skills
    .flatMap((skill) =>
      Object.entries(skill.files)
        .filter(
          ([filePath]) =>
            path === skillResourcePath(skill.id, filePath) ||
            path === `${packagedSkillsRoot}${skill.id}/${filePath}`,
        )
        .map(([, fileContent]) => fileContent),
    )
    .at(0);
  if (content === undefined) {
    throw new Error(`[flue] Packaged skill file not found: ${input.path}`);
  }
  const allLines = content.split("\n");
  const startLine = input.offset ? Math.max(0, input.offset - 1) : 0;
  if (startLine >= allLines.length) {
    throw new Error(
      `Offset ${input.offset} is beyond end of file (${allLines.length} lines total)`,
    );
  }
  const endLine = input.limit ? startLine + input.limit : allLines.length;
  const { text, linesEmitted, cut } = truncateHead(
    allLines.slice(startLine, endLine),
  );
  const shownEnd = startLine + linesEmitted;
  const note = !cut
    ? ""
    : linesEmitted === 0
      ? `\n\n[Line ${startLine + 1} exceeds the ${maxReadBytes}-byte read limit; showing the first ${maxReadBytes} bytes of it. The remainder of this line is not accessible via offset/limit.]`
      : `\n\n[Showing lines ${startLine + 1}-${shownEnd} of ${allLines.length}. Use offset=${shownEnd + 1} to continue.]`;
  return { text: `${text}${note}`, path, lines: allLines.length };
};

/** Flue's `activate_skill` (`createActivateSkillTool`). */
export const createActivateSkillTool = (skills: readonly PackagedSkill[]) =>
  defineTool({
    name: brunchTools.activateSkill,
    description:
      "Load the full instructions for one available skill before performing work that matches its description. Supporting resources remain lazy until explicitly read.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill to activate" },
      },
      required: ["name"],
    } as Schema<{ name: string }>,
    // Reads only.
    replay: "safe",
    executionMode: "parallel",
    execute: async ({ name }) => ({
      output: [{ type: "text", text: activateSkillText(skills, name) }],
      details: { skill: name },
    }),
  });

/** Flue's `read_skill_resource` (`createPackagedSkillReadTool`). */
export const createReadSkillResourceTool = (skills: readonly PackagedSkill[]) =>
  defineTool({
    name: brunchTools.readSkillResource,
    description:
      "Read a packaged skill supporting file by its advertised path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read" },
        offset: {
          type: "number",
          description: "Line number to start from (1-indexed)",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read",
        },
      },
      required: ["path"],
    } as Schema<{ path: string; offset?: number; limit?: number }>,
    // Reads only.
    replay: "safe",
    executionMode: "parallel",
    execute: async (args) => {
      const { text, path, lines } = readSkillResource(skills, args);
      return { output: [{ type: "text", text }], details: { path, lines } };
    },
  });

export const hashSkillsSectionKey = "skills";

/** HASH's skill tools and its catalogue section, the catalogue untagged as Flue renders it. */
export const hashSkillsExtension = defineExtension({
  name: "brunch.hash-skills",
  tools: [
    createActivateSkillTool(hashSkills),
    createReadSkillResourceTool(hashSkills),
  ],
  sections: [
    section(hashSkillsSectionKey, () => renderSkillCatalogue(hashSkills), {
      tag: false,
    }),
  ],
});
