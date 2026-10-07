# Python repository chores

The constraint engine runs Python callables over a uv workspace. Each manifest is one live `tomlkit` document, and rules change its nodes through domain operations. `packaging` parses requirements, version specifiers, dependency groups and license identifiers. `license-expression` represents license expressions as trees. Native Turbo declarations use `json-five` syntax trees, restricted to JSON with comments and trailing commas.

```python
from pathlib import Path

from repo_chores.constraints._engine import Engine, Workspace


def python_versions(workspace: Workspace) -> None:
    required = workspace.python_version
    if required is None:
        workspace.error(ValueError("The workspace must declare requires-python"))
        return

    for package in workspace.members:
        package.python_version = required


engine = Engine(directory=Path.cwd())
report = engine.check(constraints=[python_versions])
print(report)
```

`check` evaluates in memory and leaves source manifests unchanged. `fix` writes the evaluated documents after the rules converge without errors. Both return structured reports. Warnings permit fixes. Call `engine.fix(constraints=[python_versions])` to apply the example's policy.

## Commands

Check the Python workspace from any member directory, or pass `--directory` to select one:

```sh
uv run --frozen --isolated --package repo-chores repo-chores constraints
uv run --frozen --isolated --package repo-chores repo-chores constraints --fix
```

`python -m repo_chores constraints` and `python -m repo_chores.constraints` expose the same command. Both accept `--fix` and `--directory PATH`. Check is the default and leaves manifests unchanged. Add `--fix` to apply repairs.

The CLI groups errors, changes and warnings by manifest, with paths relative to the selected directory. Rich wraps output to the terminal width and leaves redirected output uncolored. A clean check or successful fix exits with status 0. Pending changes, blocked evaluation or an operational failure exit with status 1. Invalid arguments exit with status 2. Blocked reports and operational errors go to stderr. Unexpected rule exceptions retain their traceback.

From the repository root, the existing Yarn wrappers run both Node and Python constraints through Turbo:

```sh
yarn lint:constraints
yarn fix:constraints
```

To select Python alone:

```sh
turbo run lint:constraints --filter=repo-chores
turbo run fix:constraints --filter=repo-chores
```

Each implementation checks the workspace once. Neither task caches its result. The Node task has a distinct root-task name so the Yarn wrapper cannot invoke itself through Turbo.

## Rule behavior

- Records and collections are live proxies. A retained view reads the document when used, including changes from another view of the same entry. Constructing a proxy does not decode its contents. An operation that needs a field's meaning reports malformed contents when it reads them, but a whole-value replacement can discard those contents without interpreting them. The document adapters own TOML mutation.
- Document adapters update the native nodes and record the rule, an optional reason and the pass of each actual change. The engine scopes one mutation recorder to the evaluation. A value equal to the current one keeps its bytes and records nothing. `with workspace.reason(text):` attributes the operations inside the block to one reason.
- A pass that changes nothing ends evaluation. A pass whose resulting state repeats an earlier state is a cycle and blocks evaluation, including two rules that undo each other within every pass while the pass ends on unchanged bytes. `Engine.max_passes` bounds runs that keep changing.
- Assigning an attribute of a dependency view writes its entry immediately. Other views of that entry see the assignment. A retained view follows its entry through sorting and refuses access after removal. Attribute getters return parsed values: mutating an attribute's object in place writes nothing; assign the attribute again. `insert` given a view reads its current value.
- Inserting a new requirement matches normalized name, extras and marker. Duplicate matches receive the inserted value with a warning. `get(name)` warns on ambiguous names and returns the last declaration.
- `dependency_group(name)` iterates direct requirements and can create a group. Insertion also matches requirements in included groups and edits their source entries. Include directives remain intact. `dependency_groups.resolve(name)` computes the expanded requirements through `packaging` from the current declarations.
- `build_system` reads a live `BuildSystem` view or `None`. Its `requires` property is a mutable `RequirementList`. Entry edits and sorting write through immediately. Backend and backend-path assignments also write through. Assigning one package's build system to another copies the table without sharing mutable nodes.
- `sources` maps normalized dependency names to live source definitions. `package.sources.use_workspace(name)` replaces that source with a workspace reference. Reads retain the declared spelling of its key and reject duplicate normalized names.
- `uv_build_layout` is a live configuration view. Assign its `module_names` and `module_root` fields to repair the layout without replacing other backend options. Absent fields expose uv's defaults without creating configuration. `is_package` respects `tool.uv.package`, defaulting to the presence of a build system.
- `authors.inline()` turns a `[[project.authors]]` array of tables into an inline array, keeping each entry's comments beside it. `sort_sections(key=...)` orders header sections at every level by a key over their full path, keeping scalar keys in place and the comments and blank lines above a header with it. Comments above the first section stay at the top of the file. `requirement_lists` yields every requirement array, and `sort(key=...)` on one sorts its requirements stably while include directives stay in place.
- Pytest exposes `test_paths` and `python_paths`. Assigned absolute paths become relative to the package directory. The engine retains the existing native or `ini_options` layout and rejects a mixture of both.
- Each package exposes typed `tach.source_roots` and `tach.excluded_paths`. Assignments replace the complete `tool.tach.source_roots` and `tool.tach.exclude` arrays in that manifest. Excluded directory paths end with a slash. Other Tach settings remain unchanged.
- `ruff` exposes inheritance, target version, source roots, selection and located ignored selectors. Assigned absolute paths become package-relative. `select = None` removes modern and legacy selections, and `is_configured = False` removes the Ruff table. `workspace.ruff_configurations` also includes nested pyproject overrides outside member roots. `standalone_ruff_files` lists separate Ruff configuration files.
- `members` accepts package views and paths relative to the root. Assignment replaces membership, and later reads see the new members at once. A separate rule can check completeness. The engine checks proposed membership through uv using a temporary root manifest. uv evaluates the physical directory tree and existing exclusions.
- `workspace.turbo(package).task(name).command` reads an argv array or `None`. Assignment repairs a missing or malformed command, and assigning `None` removes it. `depends_on`, `env` and `pass_through_env` read and assign the native `dependsOn`, `env` and `passThroughEnv` arrays.
- Missing scalar metadata reads as `None`. Collection views support iteration over absent fields. Reports distinguish an absent array from an explicit empty array. `Manifest` owns the path, original bytes, document and write-safety checks, not a second editing API.

Reported errors describe the final pass. An earlier pass can supply a missing prerequisite and clear an error. Rule-authored warnings survive subsequent passes, with identical location, rule and message combinations reported once. Unexpected rule exceptions propagate without writing files. Assignments validate TOML conversion before changing nodes. Completed operations remain in memory if a later operation fails. Discovery through uv and TOML parsing precede evaluation and can reject a manifest before any rule runs. Their failures carry their location.

`CheckStatus` distinguishes `CLEAN`, `CHANGES` and `BLOCKED`. `FixStatus` distinguishes `UNCHANGED`, `APPLIED` and `BLOCKED`. A report carries the chronological operation trace and the final diff of each changed manifest. An integer component in an operation's location describes the array index at that point in the trace. The trace records what happened, including changes a later operation reverted. The diff is what a fix writes. Nothing replays the original spelling of a value that changed and changed back.

Before writing, the engine verifies every loaded TOML and Turbo file against its original bytes, including unchanged inputs. `SourceFile` shares that verification across formats. Each file replacement is atomic. A failure can leave earlier replacements in place, and the exception identifies those paths. The engine rejects symlinked inputs. New files use an atomic no-replace operation so a concurrent creator cannot be overwritten. String edits retain their quote style when the new text fits it. New values use the library's quoting and placement. Sorting an array moves each entry with its same-line comment and the comment block above it. Comments on the opening bracket's line and after the last entry stay with the array, and an insertion into a nonempty array lands before that closing block. Replacing a collection or table replaces its subtree rather than merging values into existing entries. Proxies to removed entries become invalid. To preserve an entry and its comments, change its fields directly or move it by explicit sorting. Assignment does not infer a correspondence by package name. Removed declarations lose their own comments. Removing a key also removes an implicit parent table that held only that key.

Turbo edits keep unrelated bytes and comments on surviving command slots. New entries precede the closing comment block. Removed entries can lose their own comments. The adapter validates edited output before making it visible to other rules. It uses the pinned `json-five` model API for parsing and editing, then checks raw tokens with the standard JSON parser after removing parsed comments and trailing commas. The adapter rejects JSON5-only syntax. These operations need no Node installation.

## Repository policies

Repository policies compose as ordinary engine constraints. The `repo_chores.constraints.rules` module registers the default policies.

- `enforce_authors` keeps one author named `HASH` without an email address in each project, including the root project when present. It edits the first entry in place, adds one when absent and removes the remaining entries.
- `enforce_manifest_style` groups project sections first, then build-system, dependency-groups, tool.uv, other tools and remaining sections. Children stay with their parent, and other tools and remaining sections sort lexically. Scalar metadata keys retain their order. Existing author arrays-of-tables become inline arrays with comments retained beside the entries. Absent authors and tables stay absent. Nested author tables produce an error. Runtime, optional, dependency-group, build and constraint requirement lists sort stably by normalized package name in both root and member manifests. Each include-group directive separates independently sorted runs of direct requirements. Extras, markers, versions and URL spelling do not affect ordering. Duplicates and explicit transitive-only constraints remain.
- `enforce_ruff_configuration` keeps `ALL` as the root selection and makes local pyproject overrides extend that root. It removes local `select`, including the legacy spelling, and both scalar and per-file target-version overrides. A Ruff table with no options besides `extend` disappears, leaving automatic root inheritance. Ignored selectors must identify one rule in the installed Ruff catalog, including per-file ignores and legacy settings. Prefixes and `ALL` are errors because choosing replacement exceptions requires a decision. Standalone `ruff.toml` and `.ruff.toml` files are errors and remain untouched. Git discovery includes tracked and unignored untracked configuration files. Outside Git, discovery walks the workspace while excluding generated environments and build outputs.
- `enforce_ruff_source_roots` syncs root `tool.ruff.src` from the members' import roots. For uv-built packages, it follows `module-root`, including layout repairs from earlier passes. Other members use their `src` directory when present, otherwise their package directory. These paths classify imports rather than select files to lint.
- `enforce_pytest_paths` uses the members' import roots for workspace `pythonpath` and existing member `tests` directories for workspace `testpaths`. `enforce_tach_paths` assigns each member's own import root to its `source_roots`, excluding existing `tests` and `scripts` directories only when they fall inside that root and contain no declared uv build module. Both follow membership and layout repairs at convergence without creating workspace-wide Tach configuration.
- `enforce_turbo_task` repairs each member's explicit `lint:deptry`, `lint:tach` and `test:unit` commands. Deptry scans the import root and an existing `scripts` directory not already covered by that root. Tach reads the member's native configuration. Pytest receives `.` from the member directory, so workspace `testpaths` cannot expand collection to other members. The rule removes redundant root command overrides for active members. Each `test:unit` task receives the Python and uv environment lists, prefixed with `$TURBO_EXTENDS$` to retain inherited settings such as `TEST_COVERAGE`. Built-in `HOME` and `APPDATA` passthrough needs no declaration. Member Turbo configuration retains preparation prerequisites. It neither translates tool options into arguments nor executes the checks.
- `enforce_build_system` copies the workspace root's backend, requirements and optional backend paths to each member. A missing root backend or requirement list is an error. The repository root selects `uv_build`, with `uv_build>=0.12.16,<0.13.0` as its build requirement.
- `enforce_build_layout` repairs a missing uv build layout from existing source directories. It looks in the configured module root, then `src`, then the package directory. A root that is itself a Python package becomes the module, otherwise one child package identifies the layout. Multiple candidates at the selected root or no candidates produce an error. Existing valid uv settings remain, and Hatch settings do not participate. Explicitly non-packaged projects and other backends are exempt. This checks module paths and initializers, not wheel contents or exclusion patterns.
- `enforce_workspace_sources` routes internal runtime, optional, group and build requirements to workspace members. It respects an inherited root source when no member override exists. It replaces conflicting overrides and direct URLs, with warnings. External sources, requirement extras, markers and version ranges remain.
- `enforce_pinned_dependency_versions` creates or advances shared pins, then assigns their specifiers to runtime, optional, dependency-group and build requirements across the workspace. It preserves dependency extras and markers.
- `enforce_workspace_dev_dependencies` inserts declarations from the root's resolved `dev` group into each member's `dev` group. Included groups count toward that baseline, and package-specific dependencies remain. A missing root `dev` group is an error because it supplies no baseline.

Shared pins live in the root manifest. The rule creates missing entries from dependency declarations:

```toml
[tool.uv]
constraint-dependencies = [
    "packaging>=26.3,<27",
    "ruff>=0.16.8,<0.17",
    "uv_build>=0.12.16,<0.13",
]
```

For each normalized package name, the greatest version declared by `>=`, `>`, `~=`, `==`, or a parseable PEP 440 `===` value selects the lower bound. Comparison uses PEP 440 ordering, including wildcard prefixes but excluding upper bounds and exclusions as version candidates. The existing pin participates, so an older dependency cannot lower it. This chooses among manifest declarations without querying a registry.

The selected declarations gain a caret-style upper bound unless they use equality. Existing tighter caps and exclusions remain. Compatible older declarations also constrain the range; a disjoint older version declaration advances to the newest range instead. Upper-bound-only and exclusion-only declarations constrain a selected range but cannot supply its version. Incompatible selected ranges are errors, not order-dependent choices. The semver rule uses the same bounding operation rather than widening a tighter range.

Duplicate pins receive the selected specifier with a warning. The rule removes pin extras and markers to make the pin apply globally. Dependencies retain their own extras and markers. Unversioned internal workspace dependencies need no pin unless explicitly pinned.

A direct URL cannot supply a registry version. A dependency also needs attention when no declaration supplies a usable lower or exact version. Those cases produce errors rather than inventing a version or replacing a URL with a registry source.

```python
from repo_chores.constraints.rules import (
    enforce_authors,
    enforce_build_system,
    enforce_pinned_dependency_versions,
    enforce_workspace_dev_dependencies,
)

report = engine.check(
    constraints=[
        enforce_authors,
        enforce_build_system,
        enforce_pinned_dependency_versions,
        enforce_workspace_dev_dependencies,
    ]
)
```

## Extending constraints

### When to add a rule

A constraint expresses a repository policy across package manifests. Add one when the repository has a chosen value or relationship to enforce, such as the shared build system. Extend an existing rule when it already owns that policy. Leave dependency resolution and lockfile validation to uv. Taplo handles whitespace formatting, while `enforce_manifest_style` handles section order, author representation and requirement order. Source analysis stays with its existing tools.

Decide where the expected value comes from before writing the rule. Prefer the workspace root or another declared input over a duplicated constant. If the value requires a human choice, report the missing choice rather than inventing it. A missing member value is repairable when the workspace already supplies it.

### Implement and select the policy

Rules accept a `Workspace`. Attribute assignments and collection operations change the live documents. Only `fix` writes files. For example, `package.authors[0].name = "HASH"` updates the existing author, while `package.authors.append(name="HASH")` creates an entry.

The CLI passes `constraints.rules.CONSTRAINTS` to the engine. That ordered list selects the default policies. Engine callers can pass any sequence of workspace callables, including a subset of repository policies.

Read the public domain API rather than reaching into a manifest document. Use `error` when repair requires an unavailable source value or a decision. Use `warning` when the rule can choose a repair but the choice deserves inspection. Do not query registries or invoke a package manager from a rule.

### Extend the domain API

A new field starts in its owning domain, such as `Package` or `Workspace`. A record or collection holds its live document proxy. Follow `Requirement` for parser-backed fields. Its node remains authoritative throughout the proxy's lifetime, with interpretation deferred until an operation needs the value. A whole-value replacement must also accept malformed old contents. Keep validation required by the requested operation, including TOML conversion and membership checks.

TOML document operations belong in `document.py`. Native section handling belongs in `document_native.py`. Turbo task views use `jsonc.py` for preserving JSONC edits. Use private `tomlkit` APIs there when needed to preserve entry identity, comments or layout. Build only the operations a current consumer needs. Keep supporting definitions before their consumers.

### Test the change

Exercise actual policies together: run `check` on the repository, then introduce combinations of drift in a disposable workspace. Run `check` and verify it did not write, run `fix`, inspect the diff, and run both again to establish convergence.

Automated tests cover engine mechanics with test-local constraints. Reuse small fixtures and bounded operation sequences to test live reads, writes and their traces. Keep focused convergence and file-write-safety cases where combining them would obscure the failure. Different operation orders need not produce identical results.

Add compact, composable tests for nontrivial repository policies when they catch distinct failure modes, such as conflicting shared pin ranges or layout changes that affect derived paths. Skip policies consisting only of fixed assignments. Do not test library behavior or restate the implementation in assertions. Use pytest and disposable workspaces, not a separate testing framework. Assert exact bytes where the engine promises to keep them, alongside the parsed values.

## Import boundaries

Each member's `pyproject.toml` defines its Tach module boundaries and strict settings. In repo-chores, `[[tool.tach.modules]]` entries separate the command host, constraints and engine modules. The engine cannot import the policy or CLI modules. Run `yarn lint:tach` from the repository root for member-local internal boundaries and `yarn lint:deptry` for declared external dependencies. Deptry scans member import roots (`src` in this workspace) and separate `scripts` directories. Member `tests` directories outside those roots are not scanned. Configure nested or unusual test-directory exclusions and module aliases in the member's `tool.deptry` table. The optimizer service declares its `petrinaut-python` to `petrinaut` mapping there. The constraint engine maintains the derived paths and explicit check commands without compiling native tool settings.

Root `yarn lint:ruff`, `yarn lint:format:ruff` and `yarn lint:ty` dispatch to Turborepo's native Python tasks. Ruff and ty run once per member, with generated bindings prepared before the dependent type checks. Tach and deptry use explicit member tasks in the same affected CI matrix. The root Python project remains excluded to avoid duplicate workspace-wide native checks.

`turbo run test:unit --filter=<member-name>` runs pytest once in that member. The bindings task first generates models, tracks transitive sources through `manifest` and builds the CLI. The service task checks the OpenAPI schema and tracks dependency manifests. Native `test` remains available, but executable `test:unit` does not depend on that pytest-running task.

## Checks

From the repository root:

```sh
uv run --frozen --isolated --package repo-chores --group dev python -m pytest libs/@local/repo-chores/python/tests
uv run --frozen --isolated --package repo-chores --group dev ruff format --check libs/@local/repo-chores/python
uv run --frozen --isolated --package repo-chores --group dev ruff check libs/@local/repo-chores/python
uv run --frozen --isolated --package repo-chores --group dev ty check libs/@local/repo-chores/python
yarn lint:format libs/@local/repo-chores/python/README.md
vale libs/@local/repo-chores/python/README.md
```
