import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pathExists } from "fs-extra";
import yaml from "js-yaml";

import { Frontmatter } from "./schemas";

export interface Skill {
  frontmatter: Frontmatter | null;
  body: string;
}

export const parseSkill = async (content: string): Promise<Skill> => {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content };
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

  return { frontmatter, body };
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
