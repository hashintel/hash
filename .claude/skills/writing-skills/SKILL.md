---
name: writing-skills
description: Create and manage Claude Code skills in HASH repository following Anthropic best practices. Use when creating new skills, modifying skill-rules.json, understanding trigger patterns, working with hooks, debugging skill activation, or implementing progressive disclosure. Covers skill structure, YAML frontmatter, trigger types (keywords, intent patterns), UserPromptSubmit hook, and the 500-line rule. Includes validation and debugging with SKILL_DEBUG. Examples include rust-error-stack, cargo-dependencies, and rust-documentation skills.
---

# Writing Claude Code Skills for HASH

## Purpose

Comprehensive guide for creating and managing skills in Claude Code with auto-activation system, following Anthropic's official best practices including the 500-line rule and progressive disclosure pattern.

## When to Use This Skill

Automatically activates when you mention:

- Creating or adding skills
- Modifying skill triggers or rules
- Understanding how skill activation works
- Debugging skill activation issues
- Working with skill-rules.json
- Hook system mechanics
- Claude Code best practices
- Progressive disclosure
- YAML frontmatter
- 500-line rule

---

## System Overview

### Current Implementation

**UserPromptSubmit Hook** (Proactive Suggestions)

- **File**: `.claude/hooks/skill-activation-prompt.ts`
- **Trigger**: BEFORE Claude sees user's prompt
- **Purpose**: Suggest relevant skills based on keywords + intent patterns
- **Method**: Injects formatted reminder as context (stdout → Claude's input)
- **Use Cases**: Topic-based skills, implicit work detection
- **Debug**: Run with `SKILL_DEBUG=true` to see matching logic
- **Validation**: Run with `--validate` flag to check configuration

### Configuration File

**Location**: `.claude/skills/skill-rules.json`

Defines:

- All skills and their trigger conditions
- Enforcement levels (currently only `"suggest"` is implemented)
- Keyword triggers (exact substring matching)
- Intent pattern triggers (regex matching)

---

## Skill Types

### Domain Skills (Currently Implemented)

**Purpose:** Provide comprehensive guidance for specific areas

**Characteristics:**

- Type: `"domain"`
- Enforcement: `"suggest"` (advisory, non-blocking)
- Priority: `"high"` or `"medium"`
- Activated by keyword or intent pattern matching
- Topic or domain-specific
- Comprehensive documentation with progressive disclosure

**Examples in HASH:**

- `rust-error-stack` - Error handling with error-stack crate
- `cargo-dependencies` - Cargo.toml dependency management patterns
- `rust-documentation` - Rust doc comment best practices
- `writing-skills` - This skill! Meta-guidance for creating skills

**When to Use:**

- Complex systems requiring deep knowledge
- Best practices documentation
- Architectural patterns
- How-to guides

### Future: Guardrail Skills (Not Yet Implemented)

Guardrail skills with blocking enforcement (`"block"`) are designed but not yet implemented. These would enforce critical patterns and prevent common mistakes.

---

## Quick Start: Creating a New Skill

### Step 1: Create Skill File

**Location:** `.claude/skills/{skill-name}/SKILL.md`

**Template:**

```markdown
---
name: my-new-skill
description: Brief description including keywords that trigger this skill. Mention topics, file types, and use cases. Be explicit about trigger terms.
---

# My New Skill

## Purpose
What this skill helps with

## When to Use
Specific scenarios and conditions

## Key Information
The actual guidance, documentation, patterns, examples
```

**Best Practices:**

- ✅ **Name**: Lowercase, hyphens, gerund form (verb + -ing) preferred
- ✅ **Description**: Include ALL trigger keywords/phrases (max 1024 chars)
- ✅ **Content**: Under 500 lines - use reference files for details
- ✅ **Examples**: Real code examples
- ✅ **Structure**: Clear headings, lists, code blocks

### Step 2: Add to skill-rules.json

See [SKILL_RULES_REFERENCE.md](SKILL_RULES_REFERENCE.md) for complete schema.

**Basic Template:**

```json
{
  "my-new-skill": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "medium",
    "promptTriggers": {
      "keywords": ["keyword1", "keyword2"],
      "intentPatterns": ["(create|add).*?something"]
    }
  }
}
```

### Step 3: Test and Validate

**Test with specific prompt:**

```bash
echo '{"session_id":"test","prompt":"your test prompt","cwd":".","permission_mode":"auto","transcript_path":""}' | \
  yarn workspace @local/claude-hooks run:skill
```

**Validate configuration:**

```bash
yarn lint:skill
```

**Debug matching logic:**

```bash
echo '{"session_id":"test","prompt":"your test prompt","cwd":".","permission_mode":"auto","transcript_path":""}' | \
  yarn workspace @local/claude-hooks dev:skill
```

### Step 4: Refine Patterns

Based on testing:

- Add missing keywords that should trigger the skill
- Refine intent patterns to reduce false positives
- Use word boundaries in regex: `\\b(keyword)\\b` instead of just `keyword`

### Step 5: Follow Anthropic Best Practices

✅ Keep SKILL.md under 500 lines
✅ Use progressive disclosure with reference files
✅ Add table of contents to reference files > 100 lines
✅ Write detailed description with trigger keywords
✅ Test with 3+ real scenarios before documenting
✅ Iterate based on actual usage

---

## Current Implementation Details

### Enforcement

Currently only **SUGGEST** enforcement is implemented:

- Suggestion injected before Claude sees prompt via UserPromptSubmit hook
- Claude becomes aware of relevant skills
- Not enforced or blocking - purely advisory
- All existing skills use this pattern

**Future:** Blocking enforcement (`"block"`) and warning enforcement (`"warn"`) are designed in the schema but not yet implemented.

### Debugging and Validation

**Yarn Commands:**

- `yarn lint:skill` - Validate configuration
- `yarn workspace @local/claude-hooks run:skill` - Run skill activation with test prompt
- `yarn workspace @local/claude-hooks dev:skill` - Run with debug output enabled

**Environment Variables:**

- `SKILL_DEBUG=true` - Show detailed matching logic to stderr (automatically set by `yarn dev:skill`)
- `CLAUDE_PROJECT_DIR` - Override project directory (auto-detected if not set)

**Validation shows:**

- Project directory
- Rules file location
- Configured skills with trigger counts
- Verification that SKILL.md files exist

---

## Testing Checklist

When creating a new skill, verify:

- [ ] Skill file created in `.claude/skills/{name}/SKILL.md`
- [ ] Proper frontmatter with name and description
- [ ] Entry added to `skill-rules.json`
- [ ] Keywords tested with real prompts
- [ ] Intent patterns tested with variations
- [ ] Priority level matches importance
- [ ] No false positives in testing (use `yarn workspace @local/claude-hooks dev:skill`)
- [ ] No false negatives in testing
- [ ] JSON syntax validated: `jq . .claude/skills/skill-rules.json`
- [ ] Validation passes: `yarn lint:skill`
- [ ] **SKILL.md under 500 lines** ⭐
- [ ] Reference files created if needed
- [ ] Table of contents added to files > 100 lines

---

## Reference Files

For detailed information on specific topics, see:

### [trigger-types.md](resources/trigger-types.md)

Complete guide to trigger types (currently implemented):

- Keyword triggers (explicit topic matching)
- Intent patterns (implicit action detection)
- Best practices and examples for each
- Common pitfalls and testing strategies

**Note:** File path and content pattern triggers are documented but not yet used by the hook.

### [skill-rules-reference.md](resources/skill-rules-reference.md)

Complete skill-rules.json schema:

- Full TypeScript interface definitions
- Field-by-field explanations
- Complete guardrail skill example
- Complete domain skill example
- Validation guide and common errors

### [hook-mechanisms.md](resources/hook-mechanisms.md)

Deep dive into hook internals:

- UserPromptSubmit flow (detailed)
- Hook architecture and implementation
- Exit code behavior
- Performance considerations

**Note:** PreToolUse hooks and session state management are documented but not yet implemented.

### [troubleshooting.md](resources/troubleshooting.md)

Comprehensive debugging guide:

- Skill not triggering (use `SKILL_DEBUG=true`)
- False positives (too many triggers)
- Hook not executing at all
- Configuration validation
- Performance issues

### [patterns-library.md](resources/patterns-library.md)

Ready-to-use pattern collection:

- Intent pattern library (regex)
- Keyword pattern examples
- Organized by use case
- Copy-paste ready

### [future-enhancements.md](resources/future-enhancements.md)

Ideas for expanding the skill system:

- File-based triggers and guardrail enforcement
- Session tracking and analytics
- Advanced matching (fuzzy, multi-language)
- Developer experience improvements
- Priority recommendations

---

## Quick Reference Summary

### Create New Skill (5 Steps)

1. Create `.claude/skills/{name}/SKILL.md` with frontmatter
2. Add entry to `.claude/skills/skill-rules.json`
3. Test with `yarn lint:skill` and `yarn workspace @local/claude-hooks dev:skill`
4. Refine patterns based on testing
5. Keep SKILL.md under 500 lines

### Trigger Types (Currently Implemented)

- **Keywords**: Explicit topic mentions (substring matching)
- **Intent**: Implicit action detection (regex patterns)

See [trigger-types.md](resources/trigger-types.md) for complete details.

### Enforcement (Current)

- **SUGGEST**: Inject context before prompt - only implemented enforcement level
- **BLOCK/WARN**: Designed but not yet implemented

### Debugging

- `yarn workspace @local/claude-hooks dev:skill` - Show detailed matching logic
- `yarn lint:skill` - Validate configuration
- Check `.claude/hooks/skill-activation-prompt.ts` for implementation

### Anthropic Best Practices

✅ **500-line rule**: Keep SKILL.md under 500 lines
✅ **Progressive disclosure**: Use reference files for details
✅ **Table of contents**: Add to reference files > 100 lines
✅ **One level deep**: Don't nest references deeply
✅ **Rich descriptions**: Include all trigger keywords (max 1024 chars)
✅ **Test first**: Build 3+ evaluations before extensive documentation
✅ **Gerund naming**: Prefer verb + -ing (e.g., "processing-pdfs")

### Troubleshoot

Test hooks manually:

```bash
# Test with prompt
echo '{"session_id":"test","prompt":"test","cwd":".","permission_mode":"auto","transcript_path":""}' | \
  yarn workspace @local/claude-hooks run:skill

# Validate configuration
yarn lint:skill

# Debug matching
echo '{"session_id":"test","prompt":"test","cwd":".","permission_mode":"auto","transcript_path":""}' | \
  yarn workspace @local/claude-hooks dev:skill
```

See [troubleshooting.md](resources/troubleshooting.md) for complete debugging guide.

---

## Related Files

**Configuration:**

- `.claude/skills/skill-rules.json` - Master configuration
- `.claude/hooks/state/` - Session tracking
- `.claude/settings.json` - Hook registration

**Hooks:**

- `.claude/hooks/skill-activation-prompt.ts` - UserPromptSubmit
- `.claude/hooks/error-handling-reminder.ts` - Stop event (gentle reminders)

**All Skills:**

- `.claude/skills/*/SKILL.md` - Skill content files

---

**Skill Status**: COMPLETE - Restructured following Anthropic best practices ✅
**Line Count**: < 500 (following 500-line rule) ✅
**Progressive Disclosure**: Reference files for detailed information ✅

**Next**: Create more skills, refine patterns based on usage
