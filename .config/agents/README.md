Agent rules and symlinks
========================

This directory defines a single, canonical set of agent rules and then fans them out via symlinks into the various agent-specific locations used in this repo.

Source of truth
---------------

- Canonical rule files live in:
  - `.config/agents/rules/*.md`
- Each Markdown file in `rules/` represents one logical rule, where the **basename** (e.g. `foo.md` → `foo`) is used as the rule ID.

Frontmatter requirements
------------------------

For compatibility across all consumers (Cursor, Augment, Claude, Cline, Windsurf, etc.), **all values in YAML frontmatter must be double-quoted strings**, even when plain YAML would allow unquoted values.

This applies both when:

- Editing the Markdown files directly in `.config/agents/rules/*.md`, and
- Using the rule-editing UIs exposed by tools like Cursor and Augment (which operate on the symlinked copies).

If values are not double-quoted, some of these UIs may mis-parse and then corrupt the values when saving.

Do this (correct):

```yaml
---
name: "My rule name"
category: "typescript"
status: "experimental"
---
```

Avoid this (incorrect):

```yaml
---
name: My rule name
category: typescript
status: experimental
---
```

Some agents will mis-parse or ignore unquoted values, so always use double quotes.

Where rules are symlinked to
----------------------------

From the `rules/` directory, the `symlink-rules` script creates symlinks into these tool-specific locations:

- Cursor: `.cursor/rules/{rule}.mdc`
- Augment: `.augment/rules/{rule}.md`
- Claude: `.claude/skills/{rule}/SKILL.md`
- Cline: `.clinerules/{rule}.md`
- Windsurf: `.windsurf/rules/{rule}.md`

The content of each target file is a **symlink** back to the corresponding source file in `.config/agents/rules/`.

Running the sync script
-----------------------

From the repo root, run:

```bash
yarn agents:symlink-rules
```

This executes:

```bash
npx tsx .config/agents/symlink-rules.ts
```

The script will:

1. Check that it is running on a Unix-like platform (e.g. macOS, Linux). On Windows it becomes a no-op.
2. Check that `.config/agents/rules` exists; if not, it logs a warning and exits.
3. For each `*.md` file in `rules/`, compute the rule basename.
4. For each target configuration:
   - If the expected target path for a rule is a **symlink**, delete it (and for Claude, delete the now-empty `skills/{rule}` directory).
   - If the expected target path is a **real file or directory**, mark that rule as **disqualified** for that target and skip it (nothing is deleted or overwritten).
   - For all non-disqualified rules, create a new relative symlink from the target path back to the source rule in `rules/`.

Editing rules
-------------

You can work with rules in two main ways:

1. **Edit the Markdown directly** in `.config/agents/rules/*.md` using your editor of choice.
2. **Use the agent-specific UIs** (e.g. in Cursor or Augment) that appear when you open the corresponding symlinked rule file. Those UIs typically:
   - Expose a form-like interface for the frontmatter fields they care about.
   - Ignore frontmatter keys they don't understand.

In both cases, ensure all YAML frontmatter values remain **double-quoted** to avoid the UIs corrupting values when saving.

Implementation detail: the files in `.cursor/rules/`, `.augment/rules/`, `.claude/skills/*/SKILL.md`, `.clinerules/`, and `.windsurf/rules/` are symlinks pointing back to `.config/agents/rules/*.md`, so editing them through those UIs still updates the canonical source.

If you manually create a real (non-symlink) file in a target location where the script expects to place a symlink, that rule will be marked as disqualified for that target and will no longer be auto-synced there.

Summary
-------

- Put all shared rule content in `.config/agents/rules/*.md`.
- Always use **double-quoted YAML frontmatter values**.
- Run `yarn agents:symlink-rules` after changing rules to update all agent-specific locations.
- Avoid manually editing or creating non-symlink files at the generated targets unless you intentionally want to opt that rule out for a given agent.
