# Python repository chores

Read “Extending constraints” in [README.md](README.md) before changing the constraint engine or its policies.

- Add a constraint when a repository-wide policy needs enforcement. Extend an existing rule when the policy is already represented. Keep policy choices out of the engine.
- Rules accept a `Workspace` and repair by assignment, dependency insertion or another domain operation. Reads see earlier writes at once. Use errors when a required decision or source value is missing, not when the engine can repair drift. The CLI selects `CONSTRAINTS` from `src/repo_chores/constraints/rules.py`. Engine callers can supply their own sequence.
- Extend domain APIs when a rule needs a manifest field the engine does not expose. Parse through `packaging`, `tomlkit` and `license-expression`. Do not add a second parser or write manifests from a rule.
- Document adapters own `tomlkit` nodes. Preserve TOML comments and layout by updating those nodes directly. Use private `tomlkit` APIs inside the adapters when public operations cannot preserve the document. Bind proxies without decoding unused fields, interpreting each field only when an operation needs it. Replacing malformed contents must not require successfully interpreting the old value.
- Exercise policies together with `check` and `fix` in disposable workspaces, inspect their diffs and run again. Add compact, composable pytest cases for nontrivial policies with distinct failure modes. Skip policies consisting only of fixed assignments. Do not test library behavior or restate the code in assertions. Engine tests use test-local constraints, shared fixtures and bounded operation sequences. Keep convergence and write-safety cases focused. Arbitrary operation orders need not commute.
- Use `__eq__` for value equality. Split complex policies into cohesive types or functions. The package's Ruff configuration checks complexity.
- Keep CLI parsing and rendering outside the engine. Commands return nonzero on violations. Fixes run only when requested. Verify changes in disposable workspaces rather than running fixes against the repository as a test.
- Run the checks listed in the README before handing off changes. Distinguish existing failures from failures introduced by the change.
