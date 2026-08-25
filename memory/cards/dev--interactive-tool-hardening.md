# Harden interactive tool rendering

Frontier: n/a
Status: active
Mode: slices
Created: 2026-08-25

## Orientation

- Containing seam: Petrinaut's AI SDK message-part renderer, its interactive
  tool registry, and host-supplied widget boundary.
- Frontier: no `memory/PLAN.md` exists; this is bounded hardening for the
  current FE-1448 branch.
- Volatile state: PR #9249 has two unresolved Bugbot findings; package
  verification is currently blocked because this worktree lacks Yarn's
  node_modules state file.
- Main risk: rendering a partially streamed dynamic-tool input must not hide
  malformed completed inputs or weaken host schema validation.

Posture: earned (repository-maintenance concern; no frontier definition)

## Slice 1 — Preserve omitted interactive-tool identity

Status: done

### Objective

An omitted `interactiveTools` prop keeps a stable reference while assistant
messages stream, so completed memoized rows remain memoizable.

### Light-card cold-start reads

```text
- memory/SPEC.md   — None (absent)
- memory/PLAN.md   — category concern (absent)
- libs/@hashintel/petrinaut/AGENTS.md — React Compiler and package commands
- libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents.tsx
```

### Acceptance Criteria

```text
✓ ai-assistant-contents test — an omitted interactiveTools prop supplies the
  same reference to memoized assistant-message rows across parent rerenders.
✓ package type check — the shared empty value remains readonly-compatible with
  the public optional prop.
```

### Verification Approach

```text
- Inner: focused Vitest test for AiAssistantContents memo-prop identity.
- Middle: yarn workspace @hashintel/petrinaut lint:tsc.
- Outer: none; this is a rendering-performance invariant with an inner oracle.
```

### Assumption dependency

None — this is a settled React referential-identity hardening inside the
existing panel seam.

### Expected touched paths (tentative)

```text
libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/
├── ai-assistant-contents.tsx      ~
└── ai-assistant-contents.test.tsx ~
```

### Promotion checklist

- [ ] Does this change a requirement?
- [ ] Does this create, retire, or invalidate an assumption?
- [ ] Does this depend on an unvalidated high-impact assumption?
- [ ] Does this make or reverse a non-trivial design decision?
- [ ] Does this establish a new seam-level invariant?
- [ ] Does this change a frontier-level cross-cutting obligation or verification architecture layer?
- [ ] Does this cross more than two major seams?
- [ ] Is this the first touch in an unfamiliar seam from a fresh thread?
- [ ] Can the containing seam or current rationale not be named?

## Slice 2 — Gate host widgets on complete tool input

Status: next

### Target Behavior

A host interactive widget renders only after its dynamic tool input has reached
the AI SDK's input-available state.

### Full-card cold-start reads

```text
- memory/SPEC.md   — None (absent)
- memory/PLAN.md   — category concern (absent)
- libs/@hashintel/petrinaut/AGENTS.md — React Compiler and package commands
- libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents/get-message-render-items.ts
- libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents/tool-list.tsx
- libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/interactive-tools/registry.ts
```

### Boundary Crossings

```text
→ AI SDK dynamic-tool message part
→ message render-item and interactive-tool registry
→ host-owned widget
```

### Risks and Assumptions

```text
- RISK: state gating treats malformed completed inputs as merely pending.
  → MITIGATION: preserve parsing at input-available and surface its validation
    failure through the existing tool-call error path.
- ASSUMPTION: `input-streaming` is the only state whose input is incomplete.
  → IMPACT IF FALSE: a newly introduced partial state could reintroduce the
    render-time parser crash.
  → VALIDATE: enumerate the AI SDK tool-part states used by the local message
    type and cover every state that can reach the widget.
```

### Posture check

This earned closure materializes a declared host-widget input-ready boundary
and pins it with a message-part rendering test.

### Acceptance Criteria

```text
✓ ai-assistant-contents test — an input-streaming host dynamic tool with
  incomplete input does not invoke its input parser or render its widget.
✓ ai-assistant-contents test — the same call at input-available invokes the
  parser and renders the host widget.
✓ registry test — unknown and built-in-colliding dynamic tools still fail
  loudly when their completed input is dispatched.
```

### Invariants preserved

```text
- A valid host widget submits a schema-parsed output once — guarded by the
  existing host interactive-tool lifecycle test.
- Built-in applyAutoLayout remains interactive only when askUserFirst is true
  — guarded by interactive-tools/registry.test.tsx.
```

### Verification Approach

```text
- Inner: focused Vitest lifecycle tests for input-streaming and input-available
  host tool parts.
- Middle: yarn workspace @hashintel/petrinaut test:unit --run <affected tests>
  and yarn workspace @hashintel/petrinaut lint:tsc.
- Outer: none; the observable host-facing rendering contract is exercised by
  the component-level lifecycle test.
```

### Cross-cutting obligations

```text
- Keep host input and output schemas as the single runtime validation boundary.
- Do not replace invalid completed-input failures with a quiet fallback.
```

### Expected touched paths (tentative)

```text
libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/
├── ai-assistant-contents.test.tsx                  ~
├── ai-assistant-contents/
│   ├── get-message-render-items.ts                  ~
│   └── tool-list.tsx                                ~
└── interactive-tools/
    ├── registry.ts                                  ?
    └── registry.test.tsx                            ~
```
