#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import natural from "natural";

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
  description?: string;
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

// Initialize Porter Stemmer for English fuzzy matching
const stemmer = natural.PorterStemmer;

function debug(message: string, ...args: unknown[]) {
  if (DEBUG) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for cross-language fuzzy matching (e.g., "dokumentation" vs "documentation").
 */
function levenshteinDistance(a: string, b: string): number {
  return natural.LevenshteinDistance(a, b);
}

/**
 * Check if two words are similar enough to be considered a match.
 * Uses Levenshtein distance with a threshold based on word length.
 */
function isFuzzyMatch(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();

  // Exact match
  if (w1 === w2) {
    return true;
  }

  // Stemmed match (for English variations)
  const stem1 = stemmer.stem(w1);
  const stem2 = stemmer.stem(w2);
  if (stem1 === stem2) {
    return true;
  }

  // Levenshtein distance (for typos and cross-language)
  const maxLength = Math.max(w1.length, w2.length);
  const distance = levenshteinDistance(w1, w2);

  // Allow up to 25% difference for words 4+ chars
  // For very short words (1-3 chars), require exact or stemmed match
  if (maxLength >= 4) {
    const threshold = Math.floor(maxLength * 0.25);
    return distance <= threshold;
  }

  return false;
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

function main() {
  try {
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

      let matchType: "keyword" | "intent" | null = null;

      // Keyword matching with fuzzy support
      if (triggers.keywords) {
        // Try exact substring match first (most specific)
        const exactMatch = triggers.keywords.find((kw) =>
          prompt.includes(kw.toLowerCase()),
        );

        if (exactMatch) {
          debug(`Skill '${skillName}': MATCHED via exact keyword`, exactMatch);
          matchType = "keyword";
        } else {
          // Fall back to fuzzy word-by-word matching
          const promptWords = prompt.split(/\s+/);
          const fuzzyMatch = triggers.keywords.find((kw) => {
            const keywordWords = kw.toLowerCase().split(/\s+/);

            // For multi-word keywords, ALL words must fuzzy-match
            // For single-word keywords, just check if it matches any prompt word
            if (keywordWords.length === 1) {
              return promptWords.some((pWord) =>
                isFuzzyMatch(keywordWords[0]!, pWord),
              );
            }

            // Multi-word: all keyword words must match
            return keywordWords.every((kwWord) =>
              promptWords.some((pWord) => isFuzzyMatch(kwWord, pWord)),
            );
          });

          if (fuzzyMatch) {
            debug(
              `Skill '${skillName}': MATCHED via fuzzy keyword`,
              fuzzyMatch,
            );
            matchType = "keyword";
          } else {
            debug(`Skill '${skillName}': no keyword match`);
          }
        }
      }

      // Intent pattern matching (always check, even if keyword matched)
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
            // Only set matchType to intent if keyword didn't already match
            // (keywords are more specific and take priority)
            matchType ??= "intent";
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
      if (matchType !== null) {
        matchedSkills.push({ name: skillName, matchType, config });
        debug(`Skill '${skillName}': ADDED with matchType='${matchType}'`);
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
          if (skill.config.description) {
            output += `    ${skill.config.description}\n`;
          }
        }
        output += "\n";
      }

      if (high.length > 0) {
        output += "📚 RECOMMENDED SKILLS:\n";
        for (const skill of high) {
          output += `  → ${skill.name}\n`;
          if (skill.config.description) {
            output += `    ${skill.config.description}\n`;
          }
        }
        output += "\n";
      }

      if (medium.length > 0) {
        output += "💡 SUGGESTED SKILLS:\n";
        for (const skill of medium) {
          output += `  → ${skill.name}\n`;
          if (skill.config.description) {
            output += `    ${skill.config.description}\n`;
          }
        }
        output += "\n";
      }

      if (low.length > 0) {
        output += "📌 OPTIONAL SKILLS:\n";
        for (const skill of low) {
          output += `  → ${skill.name}\n`;
          if (skill.config.description) {
            output += `    ${skill.config.description}\n`;
          }
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
