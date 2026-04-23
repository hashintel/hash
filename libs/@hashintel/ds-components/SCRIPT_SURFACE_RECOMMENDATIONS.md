## Script Surface Recommendations

This document records the script naming conventions now applied in `@hashintel/ds-components` and suggests how sibling packages could converge on the same shape without changing their ownership boundaries.

## Goals

- Make script names verb-first and consistent across packages.
- Reserve bare top-level verbs like `build`, `dev`, and `test:unit` for the primary package workflows.
- Use suffixes to describe the surface being operated on, for example `:lib`, `:storybook`, `:ladle`, or `:buildinfo`.
- Keep cross-package ordering in `turbo.json` where possible.
- Keep package-local command composition in `package.json`.

## Applied In Ds-Components

| Old                   | New                     | Notes                                                |
| --------------------- | ----------------------- | ---------------------------------------------------- |
| `build:library`       | `build:lib`             | Shorter, consistent with `dev:lib`.                  |
| `build:info`          | `build:buildinfo`       | Makes the artifact explicit.                         |
| `storybook`           | `dev:storybook`         | Makes the runtime surface explicit.                  |
| `storybook:build`     | `build:storybook`       | Aligns with verb-first naming.                       |
| `codegen:panda`       | `codegen:runtime`       | Describes the generated output rather than the tool. |
| `codegen:ladle:panda` | `codegen:runtime:local` | Keeps the same axis order as other script names.     |
| `dev:panda:ladle`     | `dev:codegen:local`     | Groups by surface first, then role.                  |
| `ladle`               | `dev:ladle:serve`       | Removes the one-off bare tool name.                  |
| `dev:test`            | `test:unit:watch`       | Uses the same family name as the non-watch command.  |
| `preflight:ladle`     | `preview:ladle`         | Uses the actual action being performed.              |
| `test:update`         | `test:snapshots:update` | Clarifies which test family is being updated.        |

`yarn dev` now points at the package's primary human review surface, which is Ladle in `ds-components`.

## Recommended Package Shape

This is the target shape I would recommend for design-system-adjacent packages when the owners are ready:

| Kind                            | Recommended script      |
| ------------------------------- | ----------------------- |
| Primary interactive surface     | `dev`                   |
| Library-only watcher            | `dev:lib`               |
| Storybook dev server            | `dev:storybook`         |
| Ladle dev server                | `dev:ladle`             |
| Storybook static build          | `build:storybook`       |
| Ladle static build              | `build:ladle`           |
| Unit tests                      | `test:unit`             |
| Unit tests in watch mode        | `test:unit:watch`       |
| Snapshot or browser tests       | `test:snapshots`        |
| Snapshot updates                | `test:snapshots:update` |
| Runtime styling/code generation | `codegen:runtime`       |

## Recommendations For Refractive

`@hashintel/refractive` is already close. The main gaps are the Storybook names and the meaning of `dev`.

| Current           | Recommended       |
| ----------------- | ----------------- |
| `dev`             | `dev:storybook`   |
| `dev:lib`         | `dev:lib`         |
| `build-storybook` | `build:storybook` |
| `build`           | `build`           |
| `lint:eslint`     | `lint:eslint`     |
| `lint:tsc`        | `lint:tsc`        |

Optional follow-up once the owner agrees:

- Make `dev` an alias for `dev:storybook` if Storybook is the main human-facing review loop.

## Recommendations For Petrinaut

`@hashintel/petrinaut` also has the right primitives already; the main inconsistency is that `dev` currently means Storybook without saying so.

| Current       | Recommended     |
| ------------- | --------------- |
| `dev`         | `dev:storybook` |
| `build`       | `build`         |
| `test:unit`   | `test:unit`     |
| `lint:eslint` | `lint:eslint`   |
| `lint:tsc`    | `lint:tsc`      |

Optional follow-up once the owner agrees:

- Add `dev` as an alias to `dev:storybook` after the explicit name lands.
- Add `dev:lib` only if a stable library-watch workflow becomes part of the day-to-day package loop.

## Adoption Heuristics

- Prefer `dev:<surface>` over bare tool names.
- Prefer `build:<surface>` over `<surface>:build`.
- Prefer names that describe the produced artifact, such as `build:buildinfo` or `codegen:runtime`, over names that just expose the implementation tool.
- Use `:watch` only when it distinguishes a long-running variant of an existing command family.
- Avoid introducing aliases unless they materially improve day-to-day ergonomics.
