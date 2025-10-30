#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

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

function main() {
  try {
    // Read input from stdin
    const input = readFileSync(0, "utf-8");
    const data = JSON.parse(input) as HookInput;
    const prompt = data.prompt.toLowerCase();

    // Load skill rules
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const rulesPath = path.join(
      projectDir,
      ".claude",
      "skills",
      "skill-rules.json",
    );
    const rules: SkillRules = JSON.parse(
      readFileSync(rulesPath, "utf-8"),
    ) as SkillRules;

    const matchedSkills: MatchedSkill[] = [];

    // Check each skill for matches
    for (const [skillName, config] of Object.entries(rules.skills)) {
      const triggers = config.promptTriggers;
      if (!triggers) {
        continue;
      }

      // Keyword matching
      if (triggers.keywords) {
        const keywordMatch = triggers.keywords.some((kw) =>
          prompt.includes(kw.toLowerCase()),
        );
        if (keywordMatch) {
          matchedSkills.push({ name: skillName, matchType: "keyword", config });
          continue;
        }
      }

      // Intent pattern matching
      if (triggers.intentPatterns) {
        const intentMatch = triggers.intentPatterns.some((pattern) => {
          const regex = new RegExp(pattern, "i");
          return regex.test(prompt);
        });
        if (intentMatch) {
          matchedSkills.push({ name: skillName, matchType: "intent", config });
        }
      }
    }

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

      // eslint-disable-next-line no-console
      console.log(output);
    }

    process.exit(0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error in skill-activation-prompt hook:", error);
    process.exit(1);
  }
}

main();
