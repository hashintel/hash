/**
 * One Flue runbook skill. Markdown is authored on disk; `defineSkill` mounts
 * it so the hermetic `node --experimental-strip-types` proof runner can load
 * supporting files without a Vite `SKILL.md` import.
 */

import { readFileSync } from "node:fs";

import { defineSkill } from "@flue/runtime";

export const RUNBOOK_SKILL_NAME = "sdcpn-modelling";

export const READ_SKILL_RESOURCE_TOOL_NAME = "read_skill_resource";

export const RUNBOOK_RESOURCE_FILES = [
  "elicitation.md",
  "ir-template.md",
  "pn-construction.md",
  "checks.md",
] as const;

const skillFileUrl = (fileName: string): URL =>
  new URL(`./sdcpn-modelling/${fileName}`, import.meta.url);

const readSkillFile = (fileName: string): string =>
  readFileSync(skillFileUrl(fileName), "utf8");

const splitSkillMarkdown = (
  markdown: string,
): { readonly description: string; readonly instructions: string } => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown);
  if (match === null) {
    throw new Error("sdcpn-modelling/SKILL.md is missing YAML frontmatter");
  }
  const frontmatter = match[1] ?? "";
  const instructions = match[2] ?? "";
  const descriptionLine = /^description:\s+(.+)$/m.exec(frontmatter);
  const description = descriptionLine?.[1]?.trim();
  if (description === undefined || description.length === 0) {
    throw new Error("sdcpn-modelling/SKILL.md is missing description");
  }
  if (description.length > 1024) {
    throw new Error("sdcpn-modelling description exceeds 1024 characters");
  }
  return { description, instructions: instructions.trimStart() };
};

const skillMarkdown = splitSkillMarkdown(readSkillFile("SKILL.md"));

export const sdcpnModellingSkill = defineSkill({
  name: RUNBOOK_SKILL_NAME,
  description: skillMarkdown.description,
  instructions: skillMarkdown.instructions,
  files: Object.fromEntries(
    RUNBOOK_RESOURCE_FILES.map((fileName) => [
      fileName,
      readSkillFile(fileName),
    ]),
  ),
});
