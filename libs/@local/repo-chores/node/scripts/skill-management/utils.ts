import { readFileSync } from "node:fs";

import yaml from "js-yaml";

export type FrontmatterResult = {
  frontmatter: Record<string, unknown> | null;
  body: string;
};

export const extractFrontmatter = (content: string): FrontmatterResult => {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content };
  }

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const frontmatter = yaml.load(match[1]!) as Record<string, unknown>;
    const body = content.slice(match[0].length).trim();
    return { frontmatter, body };
  } catch {
    return { frontmatter: null, body: content };
  }
};

export const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

export const toTitleCase = (skillName: string): string => {
  return skillName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const loadTemplate = (
  templatePath: string,
  replacements: Record<string, string>,
): string => {
  let content = readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
};
