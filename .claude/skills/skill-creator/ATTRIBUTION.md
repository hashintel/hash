# Attribution & Changelog

## Attribution

This skill is based on and incorporates content from:

- **Anthropic's Claude Code skill-creator** - Original skill creation guidance and best practices
- **Agent Skills Specification** - https://agentskills.io/specification

## Changelog

### 2024-12-18 - Vendor-Agnostic Rewrite

**Breaking Changes:**

- Trigger configuration moved from `skill-rules.json` to `metadata.triggers` in each skill's SKILL.md frontmatter
- Must regenerate `skill-rules.json` using `generate_skill_rules.py` after modifying skills

**Changes:**

1. **Vendor-Agnostic Language**
   - Replaced all "Claude" references with generic "agent" terminology
   - Now compatible with any AI agent that supports the Agent Skills specification

2. **Follows Agent Skills Specification**
   - Updated frontmatter to follow https://agentskills.io/specification
   - Added documentation for all spec fields: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`

3. **Trigger Configuration in Frontmatter**
   - Triggers now defined in `metadata.triggers` within each SKILL.md
   - Single source of truth - no separate configuration file to maintain
   - Supports: `type`, `enforcement`, `priority`, `keywords`, `intentPatterns`, `fileTriggers`

4. **New Scripts**
   - `generate_skill_rules.py` - Generates `skill-rules.json` from all SKILL.md files
   - All scripts now use `uv run --script` for dependency management

5. **Merged Content from writing-skills**
   - Incorporated trigger type documentation
   - Added testing and validation workflows
   - Included debugging guidance

**Migration:**

To migrate existing skills to the new format:

1. Add `metadata.triggers` to your SKILL.md frontmatter:

   ```yaml
   metadata:
     triggers:
       type: domain
       enforcement: suggest
       priority: medium
       keywords:
         - keyword1
       intentPatterns:
         - "\\b(pattern)\\b"
   ```

2. Regenerate skill-rules.json:

   ```bash
   ./scripts/generate_skill_rules.py --skills-dir .claude/skills --output .claude/skills/skill-rules.json
   ```
