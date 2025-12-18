import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import chalk from "chalk";

import type { SkillRule, SkillRulesFile, Triggers } from "./schemas";
import { triggersSchema } from "./schemas";
import { extractFrontmatter, isValidRegex } from "./utils";

type ScanResult = {
  skills: Record<string, SkillRule>;
  errors: string[];
};

const validateTriggers = (skillName: string, triggers: Triggers): string[] => {
  const errors: string[] = [];

  if (triggers.intentPatterns) {
    for (let i = 0; i < triggers.intentPatterns.length; i++) {
      const pattern = triggers.intentPatterns[i]!;
      if (!isValidRegex(pattern)) {
        errors.push(
          `${skillName}: intentPatterns[${i}] is invalid regex: ${pattern}`,
        );
      }
    }
  }

  if (triggers.fileTriggers?.contentPatterns) {
    for (let i = 0; i < triggers.fileTriggers.contentPatterns.length; i++) {
      const pattern = triggers.fileTriggers.contentPatterns[i]!;
      if (!isValidRegex(pattern)) {
        errors.push(
          `${skillName}: fileTriggers.contentPatterns[${i}] is invalid regex: ${pattern}`,
        );
      }
    }
  }

  if (
    triggers.type === "guardrail" &&
    triggers.enforcement === "block" &&
    !triggers.blockMessage
  ) {
    errors.push(
      `${skillName}: Guardrail skills with 'block' enforcement require 'blockMessage'`,
    );
  }

  return errors;
};

const buildSkillRule = (triggers: Triggers, description: string): SkillRule => {
  const rule: SkillRule = {
    type: triggers.type ?? "domain",
    enforcement: triggers.enforcement ?? "suggest",
    priority: triggers.priority ?? "medium",
    description,
  };

  const promptTriggers: { keywords?: string[]; intentPatterns?: string[] } = {};
  if (triggers.keywords) {
    promptTriggers.keywords = triggers.keywords;
  }
  if (triggers.intentPatterns) {
    promptTriggers.intentPatterns = triggers.intentPatterns;
  }

  if (Object.keys(promptTriggers).length > 0) {
    rule.promptTriggers = promptTriggers;
  }

  if (triggers.fileTriggers) {
    rule.fileTriggers = triggers.fileTriggers;
  }

  if (triggers.blockMessage) {
    rule.blockMessage = triggers.blockMessage;
  }

  if (triggers.skipConditions) {
    rule.skipConditions = triggers.skipConditions;
  }

  return rule;
};

const scanSkills = (skillsDir: string): ScanResult => {
  const skills: Record<string, SkillRule> = {};
  const errors: string[] = [];

  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name);
    const skillMdPath = path.join(skillPath, "SKILL.md");

    if (!existsSync(skillMdPath)) {
      continue;
    }

    const skillName = entry.name;
    const content = readFileSync(skillMdPath, "utf-8");
    const { frontmatter } = extractFrontmatter(content);

    if (!frontmatter) {
      continue;
    }

    const metadata = frontmatter.metadata as
      | Record<string, unknown>
      | undefined;
    if (!metadata || typeof metadata !== "object") {
      continue;
    }

    const rawTriggers = metadata.triggers;
    if (!rawTriggers) {
      continue;
    }

    const triggersResult = triggersSchema.safeParse(rawTriggers);
    if (!triggersResult.success) {
      errors.push(
        `${skillName}: Invalid triggers configuration: ${triggersResult.error.message}`,
      );
      continue;
    }

    const triggers = triggersResult.data;

    if (frontmatter.name !== skillName) {
      errors.push(
        `${skillName}: Frontmatter name '${frontmatter.name}' does not match directory name`,
      );
      continue;
    }

    const triggerErrors = validateTriggers(skillName, triggers);
    errors.push(...triggerErrors);

    if (triggerErrors.length > 0) {
      continue;
    }

    const description =
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : "";
    skills[skillName] = buildSkillRule(triggers, description);
  }

  return { skills, errors };
};

export const generateSkillRules = (
  skillsDir: string,
  outputPath?: string,
  validateOnly = false,
): boolean => {
  const resolvedSkillsDir = path.resolve(skillsDir);

  if (!existsSync(resolvedSkillsDir)) {
    console.log(
      chalk.red(`❌ Skills directory not found: ${resolvedSkillsDir}`),
    );
    return false;
  }

  console.log(chalk.blue(`📂 Scanning skills in: ${resolvedSkillsDir}`));

  const { skills, errors } = scanSkills(resolvedSkillsDir);

  if (errors.length > 0) {
    console.log(chalk.red("\n❌ Validation errors:"));
    for (const error of errors) {
      console.log(chalk.red(`   • ${error}`));
    }
    return false;
  }

  const skillCount = Object.keys(skills).length;
  if (skillCount === 0) {
    console.log(chalk.yellow("⚠️  No skills with triggers found"));
    return true;
  }

  const rules: SkillRulesFile = {
    version: "1.0",
    description:
      "Auto-generated skill activation triggers. Do not edit manually - regenerate with generate-skill-rules.ts",
    skills,
  };

  console.log(chalk.green(`\n✅ Found ${skillCount} skill(s) with triggers:`));
  for (const [name, rule] of Object.entries(skills)) {
    const keywords = rule.promptTriggers?.keywords?.length ?? 0;
    const patterns = rule.promptTriggers?.intentPatterns?.length ?? 0;
    console.log(`   • ${name}: ${keywords} keywords, ${patterns} patterns`);
  }

  if (validateOnly) {
    console.log(chalk.green("\n✅ Validation passed!"));
    return true;
  }

  const finalOutputPath =
    outputPath ?? path.join(resolvedSkillsDir, "skill-rules.json");

  writeFileSync(finalOutputPath, JSON.stringify(rules, null, 2) + "\n");
  console.log(chalk.green(`\n✅ Generated: ${finalOutputPath}`));

  return true;
};

const main = () => {
  const args = process.argv.slice(2);

  let skillsDir: string | undefined;
  let outputPath: string | undefined;
  let validateOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--skills-dir" && args[i + 1]) {
      skillsDir = args[i + 1];
      i++;
    } else if (arg === "--output" && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (arg === "--validate") {
      validateOnly = true;
    }
  }

  if (!skillsDir) {
    console.log(
      "Usage: generate-skill-rules --skills-dir <path> [--output <path>] [--validate]",
    );
    console.log("\nExamples:");
    console.log("  generate-skill-rules --skills-dir .claude/skills");
    console.log(
      "  generate-skill-rules --skills-dir .claude/skills --output .claude/skills/skill-rules.json",
    );
    console.log(
      "  generate-skill-rules --skills-dir .claude/skills --validate",
    );
    process.exit(1);
  }

  const success = generateSkillRules(skillsDir, outputPath, validateOnly);
  process.exit(success ? 0 : 1);
};

main();
