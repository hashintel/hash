import { defineSkill, type SkillDefinition } from "@flue/runtime";

/**
 * Turn an authored Agent Skills `SKILL.md` (frontmatter + body) and its
 * supporting files into one Flue skill definition.
 *
 * Flue's native directory import (`import skill from "./SKILL.md"`) is
 * packaged by `@flue/vite` at application build time. Brunch packages are
 * library builds, so they ship the same directory content through `?raw`
 * imports and `defineSkill`, which writes spec-valid frontmatter itself. The
 * authored `SKILL.md` therefore stays the single home for the skill's name,
 * description, and instructions, and `files` keeps each supporting resource
 * at the relative path the model will read it from.
 */
export function skillFromMarkdown(
  skillMarkdown: string,
  files?: SkillDefinition["files"],
): SkillDefinition {
  const match =
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(skillMarkdown.trim()) ??
    undefined;
  if (match === undefined) {
    throw new Error("SKILL.md must begin with a frontmatter block.");
  }
  const [, frontmatter = "", body = ""] = match;
  const field = (key: string): string => {
    const prefix = `${key}:`;
    const line = frontmatter
      .split(/\r?\n/u)
      .find((candidate) => candidate.startsWith(prefix));
    if (line === undefined) {
      throw new Error(`SKILL.md frontmatter is missing \`${key}\`.`);
    }
    return line.slice(prefix.length).trim();
  };
  return defineSkill({
    name: field("name"),
    description: field("description"),
    instructions: body.trim(),
    ...(files === undefined ? {} : { files }),
  });
}
