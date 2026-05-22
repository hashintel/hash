---
name: fractal-file-structuring
description: "Use when creating, moving, splitting, or organizing TypeScript files and folders. Applies fractal tree file-structuring rules which reduce the cognitive overhead of choosing where to put files and ultimately navigating a codebase (once the structure is established and understood)."
license: MIT
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - TypeScript
      - JavaScript
      - file structure
      - folder structure
      - create file
      - create folder
      - split file
      - shared folder
    intent-patterns:
      - "\\b(create|add|move|split|organize|refactor)\\b.*?\\b(file|folder|directory|module|component|hook|type|helper)\\b"
      - "\\b(file|folder|directory)\\b.*?\\b(structure|layout|organization|placement)\\b"
---

# Fractal File Structuring

TypeScript and JavaScript files should be organised in a fractal tree structure. Use this skill when deciding where to create, move, split, or organize files and folders in a TypeScript or JavaScript workspace.

This guidance is based on HASH's file-structuring approach: https://hash.dev/blog/file-structuring

## Scope

Apply this skill to TypeScript and JavaScript source files, including modules, components, hooks, helpers, types, tests, scripts, and entry points.

## Core Rules

### Use kebab-case names

Use kebab-case for all TypeScript and JavaScript file and folder names.

```text
create-worker-factory.ts
playback-settings-menu.tsx
button.tsx
```

Avoid PascalCase, camelCase, and mixed-case file names, even for React components.

### Do not create index files

Do not add `index.ts`, `index.tsx`, `index.js`, or `index.jsx` files for folder imports. Prefer explicit file entry points with meaningful names.

If a subtree needs a public entry point, name that file after the concept it exposes (e.g. `schema.ts`)

### Treat each file as a mini-library

A file should expose one or more named exports with a shared semantic purpose. The file name should summarize that purpose (e.g. `users.ts`)

If a file contains only one main export, prefer naming the file after that export in kebab-case (e.g. `create-user.ts`)

Avoid default exports unless a framework or external API requires them.

### Split outgrown files into private subtrees

When a file becomes too large or contains implementation details worth extracting, create a same-named folder next to it and move private pieces there.

```text
editor-view.tsx              # public mini-library: the component other files import
editor-view/
  panels.tsx                 # private entry point imported by editor-view.tsx
  panels/
    simulate-view.tsx        # private to panels.tsx
  calculate-timeline-range.ts # private helper used only by editor-view.tsx
  create-panel-state.ts       # private helper used only by editor-view.tsx
```

Only `editor-view.tsx` should import from direct child mini-libraries such as `editor-view/panels.tsx` and `editor-view/calculate-timeline-range.ts`. Only `editor-view/panels.tsx` should import from `editor-view/panels/*.tsx`. Other files should import from `editor-view.tsx`, not from its private subtree. This keeps `editor-view.tsx` as the API boundary and makes `editor-view/` read as its implementation.

If `editor-view/calculate-timeline-range.ts` grows and needs its own private implementation files, create `editor-view/calculate-timeline-range/`. Only `editor-view/calculate-timeline-range.ts` should import from that deeper subtree.

```text
editor-view/
  calculate-timeline-range.ts
  calculate-timeline-range/
    clamp-time.ts             # private to calculate-timeline-range.ts
    get-visible-duration.ts    # private to calculate-timeline-range.ts
```

### Keep private subtrees private

Do not import directly from another file's implementation folder.

```typescript
// Avoid: reaches into another file's private subtree
import { SimulateView } from "../editor-view/panels/simulate-view";

// Prefer (1): import from a public mini-library (if it is conceptually part of editor-view)
import { EditorView } from "../editor-view";

// Prefer (2): move shared code to a shared folder (if it is NOT conceptually part of editor-view)
import { Button } from "../shared/button";
```

If a resource must be available outside the subtree, re-export it from the subtree root only when it is part of that root's public concept. If it is independently useful to sibling branches, move it to an appropriate `shared/` folder instead.

### Put shared resources at the closest fork

When multiple sibling branches need the same helper, type, component, constant, or hook, place it in the nearest applicable `shared/` folder.

```text
editor-view.tsx
editor-view/
  shared/
    duration-label.tsx        # used by both panels.tsx and bottom-section.tsx
    playback-time.ts          # shared formatting/parsing logic for this subtree
  panels.tsx                  # imports from panels/
  panels/
    simulate-view.tsx         # private to panels.tsx
  bottom-section.tsx          # imports from bottom-section/
  bottom-section/
    bottom-bar.tsx            # private to bottom-section.tsx
```

Place shared files as deep as possible while still covering all current consumers. Do not move something to a high-level shared folder just because it might be reused later.

Here `editor-view.tsx` imports `./editor-view/panels` and `./editor-view/bottom-section`. `panels.tsx` may import `./panels/simulate-view` and `./shared/duration-label`; `bottom-section.tsx` may import `./bottom-section/bottom-bar` and `./shared/duration-label`. Nothing else should import from `panels/` or `bottom-section/` directly.

Shared files are mini-libraries too. A shared file can have its own private same-named subtree, and those internals should remain private to that shared file.

```text
editor-view/
  shared/
    playback-time.ts          # public to editor-view/* branches
    playback-time/
      parse-playback-time.ts  # private to playback-time.ts
      format-playback-time.ts # private to playback-time.ts
```

If later only `bottom-bar.tsx` uses `duration-label.tsx`, move it beside `bottom-bar.tsx` or under `bottom-bar/`. The folder structure should describe current consumers, not preserve old sharing.

### Use relative imports within a workspace

For imports inside the same workspace, use relative paths. Do not introduce workspace-local aliases just to shorten paths.

Imports from other workspaces should use the package name.

### Co-locate unit tests

Place unit tests next to the file they cover.

```text
foo.ts
foo.test.ts
```

If a private extracted file needs direct tests, place those tests next to that extracted file.

```text
editor-view.tsx
editor-view.test.tsx
editor-view/
  calculate-timeline-range.ts
  calculate-timeline-range.test.ts
```

Prefer testing through the public mini-library when that gives enough coverage. Add direct tests for private extracted files when the logic is complex enough that tests through the owner would be indirect or brittle.

### Match the current shape

Organize files for the code's current relationships, not speculative future reuse. Moving files later is expected and cheaper than adding premature structure now.

## Decision Checklist

Before creating a TypeScript or JavaScript file or folder:

1. Identify the semantic concept the file represents.
2. Name the file or folder in kebab-case.
3. If extracting from an existing file, put private implementation files under a same-named folder.
4. If multiple current branches need the resource, put it in the nearest `shared/` folder.
5. Avoid `index` files and implicit folder imports.
6. Use relative imports within the workspace.
7. Co-locate tests with the file under test.

## When Unsure

Choose the location that communicates the file's current consumers and API boundary most clearly:

- Private implementation detail: place it under the owning file's same-named folder, and import it only from that owner.
- Named mini-library: create a normal named file when the concept has its own purpose and exports a small API for nearby consumers.
- Shared mini-library: place the named file in the closest `shared/` folder when multiple branches need that API.
- Subtree entry point: expose the public API from a named root file, and keep any deeper implementation files private to that root.

Do not add broad `components`, `hooks`, `utils`, `types`, or `services` folders unless absolutely necessary. If they exist, these folders MUST only be imported from by files called `components.ts`, `hooks.ts`, etc.
