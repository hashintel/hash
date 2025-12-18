import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pathExists } from "fs-extra";
import yaml from "js-yaml";

import { Frontmatter } from "./schemas";

export interface Skill {
  path: string;
  frontmatter: Frontmatter | null;
  body: string;
}

export const parseSkill = async (skillPath: string): Promise<Skill> => {
  const content = await readFile(skillPath, "utf-8");
  if (!content.startsWith("---")) {
    return { path: skillPath, frontmatter: null, body: content };
  }

  const [, frontmatterContent, body] = content.split("---", 3);
  if (frontmatterContent === undefined) {
    throw new Error("Invalid frontmatter");
  }
  if (body === undefined) {
    throw new Error("Skill must have a body");
  }

  const frontmatterData = yaml.load(frontmatterContent);
  const frontmatter = await Frontmatter.parseAsync(frontmatterData);

  return { path: skillPath, frontmatter, body };
};

export const scanSkills = async (skillsDir: string) => {
  const skills: Skill[] = [];
  const errors: { readonly path: string; readonly error: unknown }[] = [];

  for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!(await pathExists(skillPath))) {
      continue;
    }

    try {
      const skill = await parseSkill(skillPath);
      skills.push(skill);
    } catch (error) {
      errors.push({ path: skillPath, error });
    }
  }

  return { skills, errors };
};

export const toTitleCase = (skillName: string): string => {
  return skillName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const loadTemplate = async (
  templatePath: string,
  replacements: Record<string, string>,
) => {
  let content = await readFile(templatePath, "utf-8");

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  return content;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const findSkillsDir = async (): Promise<string> => {
  let cwd = __dirname;

  // from the current cwd, traverse up until we reach the root of the repo
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const gitPath = path.join(cwd, ".git");
    if (await pathExists(gitPath)) {
      break;
    }

    cwd = path.dirname(cwd);
  }

  const skillsDir = path.join(cwd, ".claude/skills");
  return skillsDir;
};
