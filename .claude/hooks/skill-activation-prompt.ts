#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ES modules don't have __dirname, so we need to derive it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  prompt: string;
}

interface PromptTriggers {
  keywords?: string[];
  intentPatterns?: string[];
}

interface SkillRule {
  type: "guardrail" | "domain";
  enforcement: "block" | "suggest" | "warn";
  priority: "critical" | "high" | "medium" | "low";
  promptTriggers?: PromptTriggers;
}

interface SkillRules {
  version: string;
  skills: Record<string, SkillRule>;
}

interface MatchedSkill {
  name: string;
  matchType: "keyword" | "intent";
  config: SkillRule;
}

const DEBUG = process.env.SKILL_DEBUG === "true";

function debug(message: string, ...args: unknown[]) {
  if (DEBUG) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}

function getProjectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR ?? path.resolve(__dirname, "..", "..");
}

function compileRegexPatterns(
  patterns: string[],
  skillName: string,
): Array<{ pattern: string; regex: RegExp }> {
  const compiled: Array<{ pattern: string; regex: RegExp }> = [];

  for (const pattern of patterns) {
    try {
      compiled.push({ pattern, regex: new RegExp(pattern, "i") });
    } catch (error) {
      throw new Error(
        `Invalid regex pattern in skill '${skillName}': ${pattern}\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return compiled;
}

function validateConfiguration(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 SKILL SYSTEM VALIDATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const projectDir = getProjectDir();
  console.log(`✓ Project directory: ${projectDir}`);

  const rulesPath = path.join(
    projectDir,
    ".claude",
    "skills",
    "skill-rules.json",
  );

  // Check if rules file exists
  try {
    const rulesContent = readFileSync(rulesPath, "utf-8");
    console.log(`✓ Rules file found: ${rulesPath}`);

    // Validate JSON
    const rules = JSON.parse(rulesContent) as SkillRules;
    console.log(`✓ JSON is valid`);

    // Count skills
    const skillCount = Object.keys(rules.skills).length;
    console.log(`✓ Found ${skillCount} skill(s):\n`);

    // Validate each skill
    for (const [skillName, config] of Object.entries(rules.skills)) {
      console.log(`  → ${skillName}`);
      console.log(`    Type: ${config.type}`);
      console.log(`    Enforcement: ${config.enforcement}`);
      console.log(`    Priority: ${config.priority}`);

      if (config.promptTriggers) {
        const keywordCount = config.promptTriggers.keywords?.length ?? 0;
        const intentCount = config.promptTriggers.intentPatterns?.length ?? 0;
        console.log(
          `    Triggers: ${keywordCount} keyword(s), ${intentCount} intent pattern(s)`,
        );

        // Validate regex patterns
        if (config.promptTriggers.intentPatterns) {
          try {
            compileRegexPatterns(
              config.promptTriggers.intentPatterns,
              skillName,
            );
            console.log(`    ✓ Intent patterns are valid`);
          } catch (error) {
            console.log(`    ❌ Invalid intent pattern:`);
            console.log(
              `       ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      } else {
        console.log(`    ⚠️  No prompt triggers configured`);
      }

      // Check if skill file exists
      const skillPath = path.join(
        projectDir,
        ".claude",
        "skills",
        skillName,
        "SKILL.md",
      );
      try {
        readFileSync(skillPath, "utf-8");
        console.log(`    ✓ SKILL.md exists`);
      } catch {
        console.log(`    ❌ SKILL.md NOT FOUND: ${skillPath}`);
      }
      console.log();
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ VALIDATION PASSED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    process.exit(0);
  } catch (error) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("❌ VALIDATION FAILED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (error instanceof Error) {
      console.log(`\nError: ${error.message}`);
    }

    process.exit(1);
  }
}

function main() {
  try {
    // Check for --validate flag
    if (process.argv.includes("--validate")) {
      validateConfiguration();
      return;
    }

    // Read input from stdin
    const input = readFileSync(0, "utf-8");
    const data = JSON.parse(input) as HookInput;
    const prompt = data.prompt.toLowerCase();

    debug("Prompt received:", prompt);

    // Load skill rules with proper path resolution
    const projectDir = getProjectDir();
    debug("Project directory:", projectDir);

    const rulesPath = path.join(
      projectDir,
      ".claude",
      "skills",
      "skill-rules.json",
    );

    debug("Loading rules from:", rulesPath);

    const rules: SkillRules = JSON.parse(
      readFileSync(rulesPath, "utf-8"),
    ) as SkillRules;

    debug("Rules loaded, checking", Object.keys(rules.skills).length, "skills");

    const matchedSkills: MatchedSkill[] = [];

    // Check each skill for matches
    for (const [skillName, config] of Object.entries(rules.skills)) {
      const triggers = config.promptTriggers;
      if (!triggers) {
        debug(`Skill '${skillName}': no prompt triggers configured`);
        continue;
      }

      let matched = false;

      // Keyword matching (cache lowercase keywords)
      if (triggers.keywords) {
        const lowercaseKeywords = triggers.keywords.map((kw) =>
          kw.toLowerCase(),
        );
        const matchedKeyword = lowercaseKeywords.find((kw) =>
          prompt.includes(kw),
        );

        if (matchedKeyword) {
          debug(`Skill '${skillName}': MATCHED via keyword`, matchedKeyword);
          matched = true;
        } else {
          debug(`Skill '${skillName}': no keyword match`);
        }
      }

      // Intent pattern matching (compile once per skill)
      if (triggers.intentPatterns) {
        try {
          const compiledPatterns = compileRegexPatterns(
            triggers.intentPatterns,
            skillName,
          );

          const matchedPattern = compiledPatterns.find((cp) =>
            cp.regex.test(prompt),
          );

          if (matchedPattern) {
            debug(
              `Skill '${skillName}': MATCHED via intent pattern`,
              matchedPattern.pattern,
            );
            matched = true;
          } else {
            debug(`Skill '${skillName}': no intent pattern match`);
          }
        } catch (error) {
          console.error(
            `Warning: Skipping skill '${skillName}' due to invalid regex pattern`,
          );
          console.error(error instanceof Error ? error.message : String(error));
          continue;
        }
      }

      // Add to matched skills if any trigger matched
      if (matched) {
        matchedSkills.push({ name: skillName, matchType: "keyword", config });
      }
    }

    debug("Total matched skills:", matchedSkills.length);

    // Generate output if matches found
    if (matchedSkills.length > 0) {
      let output = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      output += "🎯 SKILL ACTIVATION CHECK\n";
      output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

      // Group by priority
      const critical = matchedSkills.filter(
        (skill) => skill.config.priority === "critical",
      );
      const high = matchedSkills.filter(
        (skill) => skill.config.priority === "high",
      );
      const medium = matchedSkills.filter(
        (skill) => skill.config.priority === "medium",
      );
      const low = matchedSkills.filter(
        (skill) => skill.config.priority === "low",
      );

      if (critical.length > 0) {
        output += "⚠️  CRITICAL SKILLS (REQUIRED):\n";
        for (const skill of critical) {
          output += `  → ${skill.name}\n`;
        }
        output += "\n";
      }

      if (high.length > 0) {
        output += "📚 RECOMMENDED SKILLS:\n";
        for (const skill of high) {
          output += `  → ${skill.name}\n`;
        }
        output += "\n";
      }

      if (medium.length > 0) {
        output += "💡 SUGGESTED SKILLS:\n";
        for (const skill of medium) {
          output += `  → ${skill.name}\n`;
        }
        output += "\n";
      }

      if (low.length > 0) {
        output += "📌 OPTIONAL SKILLS:\n";
        for (const skill of low) {
          output += `  → ${skill.name}\n`;
        }
        output += "\n";
      }

      output += "ACTION: Use Skill tool BEFORE responding\n";
      output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

      console.log(output);
    }

    process.exit(0);
  } catch (error) {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ SKILL ACTIVATION HOOK ERROR");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);

      if (error.message.includes("ENOENT")) {
        console.error(
          "\nLikely cause: skill-rules.json not found or project directory incorrect",
        );
        console.error(`Project dir: ${getProjectDir()}`);
      }

      if (DEBUG) {
        console.error("\nStack trace:", error.stack);
      } else {
        console.error(
          "\nRun with SKILL_DEBUG=true for more details:",
          "SKILL_DEBUG=true <command>",
        );
      }
    } else {
      console.error("Unknown error:", error);
    }

    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    process.exit(1);
  }
}

main();
