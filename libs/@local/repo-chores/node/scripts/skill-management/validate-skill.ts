import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import chalk from "chalk";

import { frontmatterSchema } from "./schemas";
import { extractFrontmatter } from "./utils";

export type ValidationResult = {
  valid: boolean;
  message: string;
};

export const validateSkill = (skillPath: string): ValidationResult => {
  const resolvedPath = path.resolve(skillPath);
  const skillMdPath = path.join(resolvedPath, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    return { valid: false, message: "SKILL.md not found" };
  }

  const content = readFileSync(skillMdPath, "utf-8");
  const { frontmatter } = extractFrontmatter(content);

  if (!frontmatter) {
    return {
      valid: false,
      message: "No YAML frontmatter found or invalid format",
    };
  }

  const allowedProperties = new Set([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
  ]);
  const unexpectedKeys = Object.keys(frontmatter).filter(
    (key) => !allowedProperties.has(key),
  );

  if (unexpectedKeys.length > 0) {
    return {
      valid: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpectedKeys.join(", ")}. Allowed properties are: ${[...allowedProperties].sort().join(", ")}`,
    };
  }

  const parseResult = frontmatterSchema.safeParse(frontmatter);

  if (!parseResult.success) {
    const errorMessages = parseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { valid: false, message: `Validation failed: ${errorMessages}` };
  }

  const data = parseResult.data;
  const skillDirName = path.basename(resolvedPath);

  if (!/^[a-z0-9-]+$/.test(data.name)) {
    return {
      valid: false,
      message: `Name '${data.name}' should be hyphen-case (lowercase letters, digits, and hyphens only)`,
    };
  }

  if (data.name.startsWith("-") || data.name.endsWith("-")) {
    return {
      valid: false,
      message: `Name '${data.name}' cannot start or end with a hyphen`,
    };
  }

  if (data.name.includes("--")) {
    return {
      valid: false,
      message: `Name '${data.name}' cannot contain consecutive hyphens`,
    };
  }

  if (data.name !== skillDirName) {
    return {
      valid: false,
      message: `Name '${data.name}' must match the parent directory name '${skillDirName}'`,
    };
  }

  if (data.description.includes("<") || data.description.includes(">")) {
    return {
      valid: false,
      message: "Description cannot contain angle brackets (< or >)",
    };
  }

  return { valid: true, message: "Skill is valid!" };
};

const main = () => {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.log("Usage: validate-skill <skill_directory>");
    process.exit(1);
  }

  const skillPath = args[0]!;
  const { valid, message } = validateSkill(skillPath);

  if (valid) {
    console.log(chalk.green(`✅ ${message}`));
  } else {
    console.log(chalk.red(`❌ ${message}`));
  }

  process.exit(valid ? 0 : 1);
};

main();
