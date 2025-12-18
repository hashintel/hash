# Troubleshooting - Skill Activation Issues

Debugging guide for skill activation problems.

## Skill Not Triggering

### Keywords Don't Match

**Symptoms:** Skill should trigger but doesn't.

**Check:**

- Look at `metadata.triggers.keywords` in SKILL.md
- Keywords use case-insensitive substring matching
- Verify keywords are actually in the prompt

**Example:**

```yaml
keywords:
  - layout
  - grid
```

- "how does the layout work?" → ✅ Matches "layout"
- "how does the grid system work?" → ✅ Matches "grid"
- "how does it work?" → ❌ No match

**Fix:** Add more keyword variations

### Intent Patterns Too Specific

**Check:**

- Look at `metadata.triggers.intentPatterns`
- Test regex at https://regex101.com/
- May need broader patterns

**Example:**

```yaml
intentPatterns:
  - "(create|add).*?(database.*?table)"  # Too specific
```

- "create a database table" → ✅ Matches
- "add new table" → ❌ Doesn't match (missing "database")

**Fix:** Broaden the pattern:

```yaml
intentPatterns:
  - "(create|add).*?(table|database)"  # Better
```

### Name Mismatch

**Check:**

- Skill name in SKILL.md frontmatter
- Skill directory name
- Must match exactly

**Fix:** Make names match exactly

### YAML Syntax Error

**Check:**

```bash
./scripts/generate_skill_rules.py --skills-dir .claude/skills --validate
```

**Common errors:**

- Incorrect indentation
- Missing quotes around regex patterns
- Unescaped special characters

## False Positives

**Symptoms:** Skill triggers when it shouldn't.

### Keywords Too Generic

**Problem:**

```yaml
keywords:
  - user
  - system
  - create
```

Triggers on: "user manual", "file system", "create directory"

**Solution:** Make keywords more specific:

```yaml
keywords:
  - user authentication
  - user tracking
  - create feature
```

### Intent Patterns Too Broad

**Problem:**

```yaml
intentPatterns:
  - "(create)"  # Matches everything with "create"
```

**Solution:** Add context:

```yaml
intentPatterns:
  - "(create|add).*?(database|table|feature)"
```

### File Paths Too Generic

**Problem:**

```yaml
fileTriggers:
  pathPatterns:
    - "src/**"  # Matches everything in src/
```

**Solution:** Use narrower patterns:

```yaml
fileTriggers:
  pathPatterns:
    - "src/services/**/*.ts"
    - "src/controllers/**/*.ts"
```

## Debugging Commands

### Validate Configuration

```bash
./scripts/generate_skill_rules.py --skills-dir .claude/skills --validate
```

### Regenerate Rules

```bash
./scripts/generate_skill_rules.py --skills-dir .claude/skills --output .claude/skills/skill-rules.json
```

### Test Individual Skill

```bash
./scripts/quick_validate.py .claude/skills/my-skill
```

### Check Generated Output

```bash
cat .claude/skills/skill-rules.json | jq '.skills["my-skill"]'
```

## Common Validation Errors

### "Name does not match directory"

The `name` field in SKILL.md must exactly match the directory name.

```yaml
skill-creator/SKILL.md
---
name: skill-creator  # Must match directory name
```

### "Invalid regex in intentPatterns"

Test your regex at https://regex101.com/ first.

Common issues:

- Unescaped special characters (use `\\.` for literal dot)
- Missing escape for backslash in YAML (use `\\b` not `\b`)

### "Description too long"

Description must be under 1024 characters. Move detailed content to the SKILL.md body.
